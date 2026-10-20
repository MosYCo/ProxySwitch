use crate::events;
use crate::logger::Logger;
use crate::model::{Config, HealthStatus, LogLevel, ProxyOptions};
use crate::preferences::HealthSettings;
use crate::store::Store;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify, RwLock, Semaphore};

pub struct HealthChecker {
    wake: Arc<Notify>,
    results: HashMap<String, HashMap<String, HealthStatus>>,
    http: reqwest::Client,
    insecure_http: reqwest::Client,
    checking: Arc<Mutex<()>>,
    running: bool,
}
impl HealthChecker {
    pub fn new(_interval: Duration) -> Self {
        Self {
            wake: Arc::new(Notify::new()),
            results: HashMap::new(),
            running: false,
            http: health_client(false),
            insecure_http: health_client(true),
            checking: Arc::new(Mutex::new(())),
        }
    }
    pub async fn run(
        checker: Arc<RwLock<Self>>,
        store: Arc<RwLock<Store>>,
        logger: Arc<Logger>,
        app: AppHandle,
    ) {
        {
            let mut checker = checker.write().await;
            if checker.running {
                return;
            }
            checker.running = true;
        }
        loop {
            Self::check_all_shared(&checker, &store, &logger, &app).await;
            let wake = {
                let checker = checker.read().await;
                if !checker.running {
                    break;
                }
                checker.wake.clone()
            };
            let interval = store
                .read()
                .await
                .get_config()
                .settings
                .health
                .interval_secs;
            tokio::select! { _ = tokio::time::sleep(Duration::from_secs(interval)) => {}, _ = wake.notified() => {} }
            if !checker.read().await.running {
                break;
            }
        }
    }
    pub fn stop(&mut self) {
        self.running = false;
        self.wake();
    }
    pub fn wake(&self) {
        self.wake.notify_one();
    }
    async fn check_all_shared(
        checker: &Arc<RwLock<Self>>,
        store: &Arc<RwLock<Store>>,
        logger: &Logger,
        app: &AppHandle,
    ) {
        let gate = checker.read().await.checking.clone();
        let _checking = gate.lock().await;
        let (strict, insecure, old) = {
            let checker = checker.read().await;
            (
                checker.http.clone(),
                checker.insecure_http.clone(),
                checker.results.clone(),
            )
        };
        let checked = check_enabled_projects(store, &strict, &insecure).await;
        // Discard results for targets that were edited/deleted during this check.
        let latest = store.read().await;
        let mut next: HashMap<String, HashMap<String, HealthStatus>> = HashMap::new();
        for (project, name, environment, status) in checked {
            if health_target(latest.get_config(), &project, &name).as_ref() == Some(&environment) {
                next.entry(project).or_default().insert(name, status);
            }
        }
        drop(latest);
        checker.write().await.results = next.clone();
        for (project, environments) in &next {
            for (name, status) in environments {
                let previous = old
                    .get(project)
                    .and_then(|environments| environments.get(name));
                let Some(level) = health_log_level(previous, status) else {
                    continue;
                };
                let message = if status.healthy {
                    format!(
                        "{}: {}/{}（{} ms）",
                        if previous.is_some() {
                            "后端已恢复"
                        } else {
                            "后端首次检查正常"
                        },
                        project,
                        name,
                        status.latency_ms
                    )
                } else {
                    format!(
                        "后端连接异常: {}/{} · {}",
                        project,
                        name,
                        status.error.as_deref().unwrap_or("原因未知")
                    )
                };
                logger.log_with_data(level, "health", &message, Some(serde_json::json!({"project": project, "environment": name, "healthy": status.healthy, "error": status.error, "latency_ms": status.latency_ms})));
                app.emit(
                    events::HEALTH_CHANGED,
                    serde_json::json!({"project": project, "environment": name, "status": status}),
                )
                .ok();
            }
        }
        // Every completed check publishes timestamps/latencies, even if health is unchanged.
        app.emit(events::HEALTH_UPDATED, &next).ok();
    }
    pub fn get_status(&self) -> &HashMap<String, HashMap<String, HealthStatus>> {
        &self.results
    }
    pub async fn force_check_shared(
        checker: Arc<RwLock<Self>>,
        store: &Arc<RwLock<Store>>,
        logger: &Logger,
        app: &AppHandle,
    ) {
        Self::check_all_shared(&checker, store, logger, app).await;
    }
}

type CheckedEnvironment = (String, String, HealthTarget, HealthStatus);

#[derive(Clone, PartialEq)]
struct HealthTarget {
    addr: String,
    insecure: bool,
    settings: HealthSettings,
    proxy: ProxyOptions,
}
fn health_target(config: &Config, project: &str, name: &str) -> Option<HealthTarget> {
    let project = config.projects.get(project)?;
    if !config.settings.health.enabled
        || !project.enabled
        || (config.settings.health.only_current && project.current != name)
    {
        return None;
    }
    let environment = project.environments.get(name)?;
    let settings = config
        .settings
        .health
        .with_override(&project.health)
        .with_override(&environment.health);
    if !settings.enabled {
        return None;
    }
    Some(HealthTarget {
        addr: environment.addr.clone(),
        insecure: environment.insecure_skip_verify,
        settings,
        proxy: config
            .settings
            .proxy
            .with_override(&project.proxy)
            .with_override(&environment.proxy),
    })
}

fn health_log_level(previous: Option<&HealthStatus>, status: &HealthStatus) -> Option<LogLevel> {
    if previous.is_some_and(|previous| {
        previous.healthy == status.healthy && previous.error == status.error
    }) {
        return None;
    }
    Some(if !status.healthy {
        LogLevel::Warn
    } else if previous.is_some() {
        LogLevel::Info
    } else {
        LogLevel::Debug
    })
}

async fn check_enabled_projects(
    store: &Arc<RwLock<Store>>,
    strict: &reqwest::Client,
    insecure: &reqwest::Client,
) -> Vec<CheckedEnvironment> {
    let config = store.read().await.get_config().clone();
    let permits = Arc::new(Semaphore::new(8));
    let mut tasks = tokio::task::JoinSet::new();
    for (project, data) in config
        .projects
        .iter()
        .filter(|(_, project)| project.enabled)
    {
        for name in data.environments.keys() {
            let Some(target) = health_target(&config, project, name) else {
                continue;
            };
            let (project, name) = (project.clone(), name.clone());
            let client = if target.insecure {
                insecure.clone()
            } else {
                strict.clone()
            };
            let permits = permits.clone();
            let store = store.clone();
            tasks.spawn(async move {
                let _permit = permits.acquire_owned().await.unwrap();
                // Queued checks must not contact a project that was just stopped.
                let current = store.read().await;
                let still_enabled =
                    health_target(current.get_config(), &project, &name).as_ref() == Some(&target);
                drop(current);
                if !still_enabled {
                    return None;
                }
                let status =
                    check_backend_options(&client, &target.addr, &target.settings, &target.proxy)
                        .await;
                Some((project, name, target, status))
            });
        }
    }
    let mut checked = Vec::new();
    while let Some(result) = tasks.join_next().await {
        if let Ok(Some(result)) = result {
            checked.push(result);
        }
    }
    checked
}

fn health_client(insecure: bool) -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(insecure)
        .danger_accept_invalid_hostnames(insecure)
        .build()
        .expect("failed to create health client")
}
fn parse_health_url(addr: &str) -> String {
    let value = addr.trim().trim_end_matches('/');
    if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("http://{}", value)
    }
}
#[cfg(test)]
async fn check_backend(http: &reqwest::Client, addr: &str) -> HealthStatus {
    check_backend_options(
        http,
        addr,
        &HealthSettings::default(),
        &ProxyOptions::default(),
    )
    .await
}
async fn check_backend_options(
    http: &reqwest::Client,
    addr: &str,
    settings: &HealthSettings,
    proxy: &ProxyOptions,
) -> HealthStatus {
    let base = parse_health_url(addr);
    let start = std::time::Instant::now();
    let request = |path: &str| {
        let mut request = http.get(format!("{}{}", base, path));
        if let Some(host) = &proxy.host {
            request = request.header("host", host);
        }
        for (name, value) in &proxy.request_headers {
            if let Some(value) = value {
                request = request.header(name, value);
            }
        }
        request
    };
    let attempt = async {
        let response = request(&settings.path).send().await;
        match response {
            Ok(response)
                if !settings.fallback_to_root
                    || settings.path == "/"
                    || !matches!(response.status().as_u16(), 404 | 405)
                    || settings
                        .expected_statuses
                        .contains(&response.status().as_u16()) =>
            {
                Ok(response)
            }
            Err(error) if !settings.fallback_to_root || settings.path == "/" => Err(error),
            _ => request("/").send().await,
        }
    };
    let response = tokio::time::timeout(Duration::from_millis(settings.timeout_ms), attempt).await;
    let latency_ms = start.elapsed().as_millis() as i64;
    let (healthy, error) = match response {
        Ok(Ok(response))
            if if settings.expected_statuses.is_empty() {
                response.status().as_u16() < 400
            } else {
                settings
                    .expected_statuses
                    .contains(&response.status().as_u16())
            } =>
        {
            (true, None)
        }
        Ok(Ok(response)) => (false, Some(format!("HTTP {}", response.status()))),
        Ok(Err(error)) => (false, Some(format!("{:#}", anyhow::Error::new(error)))),
        Err(_) => (
            false,
            Some(format!("检查超时（{} ms）", settings.timeout_ms)),
        ),
    };
    HealthStatus {
        healthy,
        last_check: Utc::now(),
        error,
        latency_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn scope_overrides_and_custom_statuses_control_actual_checks() {
        let backend = crate::test_support::server(|request| {
            assert_eq!(request.path, "/base/ready");
            assert_eq!(request.headers["x-health"], "environment");
            (204, serde_json::json!({}))
        })
        .await;
        let mut project = crate::caddy::generator::tests::project(
            "demo",
            false,
            &format!("http://{}/base", backend.address),
        );
        let mut stage = project.environments["dev"].clone();
        stage.health.enabled = Some(false);
        project.environments.insert("stage".into(), stage);
        project.health.path = Some("/ready".into());
        project
            .environments
            .get_mut("dev")
            .unwrap()
            .proxy
            .request_headers
            .insert("X-Health".into(), Some("environment".into()));
        let mut config = Config {
            projects: HashMap::from([("demo".into(), project)]),
            ..Default::default()
        };
        config.settings.health.only_current = true;
        config.settings.health.expected_statuses = vec![204];
        let directory = crate::test_support::Directory::new();
        let mut store = Store::new(directory.0.join("config.json").to_str().unwrap()).unwrap();
        store.replace_config(config.clone()).unwrap();
        let store = Arc::new(RwLock::new(store));
        let http = health_client(false);
        let checks = check_enabled_projects(&store, &http, &http).await;
        assert_eq!(checks.len(), 1);
        assert!(checks[0].3.healthy);
        config.settings.health.enabled = false;
        config
            .projects
            .get_mut("demo")
            .unwrap()
            .environments
            .get_mut("dev")
            .unwrap()
            .health
            .enabled = Some(true);
        store.write().await.replace_config(config).unwrap();
        assert!(check_enabled_projects(&store, &http, &http)
            .await
            .is_empty());
        assert_eq!(backend.requests.lock().unwrap().len(), 1);
    }
    #[tokio::test]
    async fn explicit_404_is_healthy_without_fallback_and_timeout_covers_all_attempts() {
        let endpoint = crate::test_support::server(|_| (404, serde_json::json!({}))).await;
        let mut settings = HealthSettings::default();
        settings.expected_statuses = vec![404];
        let status = check_backend_options(
            &health_client(false),
            &format!("http://{}", endpoint.address),
            &settings,
            &ProxyOptions::default(),
        )
        .await;
        assert!(status.healthy);
        assert_eq!(endpoint.requests.lock().unwrap().len(), 1);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (_stream, _) = listener.accept().await.unwrap();
            tokio::time::sleep(Duration::from_millis(300)).await;
        });
        settings.timeout_ms = 100;
        let status = check_backend_options(
            &health_client(false),
            &format!("http://{}", addr),
            &settings,
            &ProxyOptions::default(),
        )
        .await;
        assert!(!status.healthy && status.error.unwrap().contains("超时"));
        assert!(status.latency_ms < 250);
        task.abort();
    }
    #[test]
    fn health_logs_only_report_initial_diagnostics_changes_and_recoveries() {
        let healthy = HealthStatus {
            healthy: true,
            last_check: Utc::now(),
            error: None,
            latency_ms: 12,
        };
        let failed = HealthStatus {
            healthy: false,
            error: Some("HTTP 500".into()),
            ..healthy.clone()
        };
        assert!(matches!(
            health_log_level(None, &healthy),
            Some(LogLevel::Debug)
        ));
        assert!(health_log_level(Some(&healthy), &healthy).is_none());
        assert!(matches!(
            health_log_level(Some(&healthy), &failed),
            Some(LogLevel::Warn)
        ));
        assert!(health_log_level(Some(&failed), &failed).is_none());
        assert!(matches!(
            health_log_level(Some(&failed), &healthy),
            Some(LogLevel::Info)
        ));
        let different_error = HealthStatus {
            error: Some("connection refused".into()),
            ..failed.clone()
        };
        assert!(matches!(
            health_log_level(Some(&failed), &different_error),
            Some(LogLevel::Warn)
        ));
    }
    #[tokio::test]
    async fn disabled_projects_receive_no_background_health_requests() {
        let backend = crate::test_support::server(|_| (200, serde_json::json!({}))).await;
        let active = crate::caddy::generator::tests::project(
            "active",
            false,
            &format!("http://{}/active", backend.address),
        );
        let mut paused = crate::caddy::generator::tests::project(
            "paused",
            false,
            &format!("http://{}/paused", backend.address),
        );
        paused.enabled = false;
        let directory = crate::test_support::Directory::new();
        let mut store = Store::new(directory.0.join("config.json").to_str().unwrap()).unwrap();
        store
            .replace_config(crate::model::Config {
                projects: HashMap::from([("active".into(), active), ("paused".into(), paused)]),
                ..crate::model::Config::default()
            })
            .unwrap();
        let store = Arc::new(RwLock::new(store));
        let http = health_client(false);
        let checked = check_enabled_projects(&store, &http, &http).await;
        assert_eq!(checked.len(), 1);
        assert_eq!(checked[0].0, "active");
        assert_eq!(backend.requests.lock().unwrap().len(), 1);
        assert_eq!(backend.requests.lock().unwrap()[0].path, "/active/health");
        let mut stopped = store.read().await.get_config().clone();
        stopped.projects.get_mut("active").unwrap().enabled = false;
        store.write().await.replace_config(stopped).unwrap();
        assert!(check_enabled_projects(&store, &http, &http)
            .await
            .is_empty());
        assert_eq!(backend.requests.lock().unwrap().len(), 1);
    }
    #[test]
    fn health_urls_preserve_base_paths_and_ports() {
        assert_eq!(
            parse_health_url("https://example.com:8443/base/"),
            "https://example.com:8443/base"
        );
        assert_eq!(parse_health_url("127.0.0.1:8080"), "http://127.0.0.1:8080");
    }
    #[tokio::test]
    async fn missing_health_route_falls_back_but_server_errors_do_not() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for (health_code, expected, requests) in [(404, true, 2), (405, true, 2), (500, false, 1)] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                for index in 0..requests {
                    let (mut stream, _) = listener.accept().await.unwrap();
                    let mut buffer = [0u8; 2048];
                    let n = stream.read(&mut buffer).await.unwrap();
                    let request = String::from_utf8_lossy(&buffer[..n]);
                    assert!(request.starts_with(if index == 0 {
                        "GET /base/health "
                    } else {
                        "GET /base/ "
                    }));
                    if index > 0 {
                        tokio::time::sleep(Duration::from_millis(35)).await;
                    }
                    let code = if index == 0 { health_code } else { 200 };
                    stream.write_all(format!("HTTP/1.1 {} Test\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", code).as_bytes()).await.unwrap();
                }
            });
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            let status = check_backend(&client, &format!("http://{}/base", address)).await;
            assert_eq!(status.healthy, expected);
            if requests == 2 {
                assert!(status.latency_ms >= 30);
            }
            server.await.unwrap();
        }
    }
}

#[cfg(test)]
mod tls_tests {
    use super::*;
    #[tokio::test]
    async fn health_check_honors_certificate_verification_setting() {
        use std::io::{Read, Write};
        let identity = native_tls::Identity::from_pkcs12(
            include_bytes!("../../tests/fixtures/health-test.p12"),
            "caddy-test-only",
        )
        .unwrap();
        let acceptor = native_tls::TlsAcceptor::new(identity).unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let server = tokio::task::spawn_blocking(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            let mut connections = 0;
            while connections < 3 && std::time::Instant::now() < deadline {
                match listener.accept() {
                    Ok((stream, _)) => {
                        connections += 1;
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        stream
                            .set_write_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        match acceptor.accept(stream) {
                            Ok(mut stream) => {
                                let mut buffer = [0u8; 1024];
                                if stream.read(&mut buffer).is_ok() {
                                    let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                                }
                            }
                            Err(_) => {}
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(error) => panic!("{}", error),
                }
            }
        });
        let address = format!("https://{}", address);
        let strict = check_backend(&health_client(false), &address).await;
        assert!(!strict.healthy);
        let relaxed = check_backend(&health_client(true), &address).await;
        assert!(relaxed.healthy, "{:?}", relaxed);
        server.await.unwrap();
    }
}
