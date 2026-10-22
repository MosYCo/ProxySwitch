use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager as _};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::events;
use crate::logger::Logger;
use crate::model::{Config, LogLevel};
use serde_json::Value;

pub struct CaddyProcess {
    pid: u32,
    started_at: Instant,
    child: Option<CommandChild>,
    alive: Arc<AtomicBool>,
    expected_exit: Arc<AtomicBool>,
}

pub struct Manager {
    app: AppHandle,
    process: Option<CaddyProcess>,
    desired_running: bool,
    recovering: bool,
    recovery_attempts: u32,
    next_retry: Option<Instant>,
    recovery_exhausted: bool,
}

impl Manager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            process: None,
            desired_running: false,
            recovering: false,
            recovery_attempts: 0,
            next_retry: None,
            recovery_exhausted: false,
        }
    }

    pub async fn start(&mut self, logger: Arc<Logger>, config: &Config) -> Result<()> {
        self.desired_running = true;
        self.recovering = false;
        self.recovery_attempts = 0;
        self.next_retry = None;
        self.recovery_exhausted = false;
        if let Some(process) = &self.process {
            if process.alive.load(Ordering::SeqCst) {
                return Ok(());
            }
            self.process = None;
        }

        let shell = self.app.shell();
        let sidecar = shell
            .sidecar("caddy")
            .map_err(|e| anyhow::anyhow!("failed to create caddy sidecar: {}", e))?;

        let config_dir = self.app.path().app_config_dir()?.join("caddy-runtime");
        std::fs::create_dir_all(&config_dir)?;
        let config_path = config_dir.join(format!("startup-{}.json", uuid::Uuid::new_v4()));
        std::fs::write(
            &config_path,
            serde_json::to_vec(&super::generate_caddy_config(config))?,
        )?;

        let spawned = sidecar
            .args(["run", "--config", &config_path.to_string_lossy()])
            .spawn();
        let (mut rx, child) = match spawned {
            Ok(child) => child,
            Err(error) => {
                let _ = std::fs::remove_file(config_path);
                return Err(anyhow::anyhow!("failed to spawn caddy: {}", error));
            }
        };

        let alive = Arc::new(AtomicBool::new(true));
        let expected_exit = Arc::new(AtomicBool::new(false));
        let expected_for_task = expected_exit.clone();
        let alive_for_task = alive.clone();
        let log_sink = logger.clone();
        let pid = child.pid();
        let app = self.app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        log_caddy_output(&log_sink, LogLevel::Info, line);
                    }
                    CommandEvent::Stderr(line) => {
                        log_caddy_output(&log_sink, LogLevel::Warn, line);
                    }
                    CommandEvent::Error(error) => {
                        log_sink.error("system", &format!("Caddy 输出读取失败: {}", error));
                    }
                    CommandEvent::Terminated(payload) => {
                        alive_for_task.store(false, Ordering::SeqCst);
                        let expected = expected_for_task.load(Ordering::SeqCst);
                        log_sink.log_with_data(
                            if expected { LogLevel::Debug } else { LogLevel::Error },
                            "system",
                            &format!("Caddy {}（PID: {}，退出码: {:?}）", if expected { "子进程已结束" } else { "意外退出，请检查 Caddy 日志" }, pid, payload.code),
                            Some(serde_json::json!({"event": "caddy.exited", "pid": pid, "exit_code": payload.code, "expected": expected})),
                        );
                        app.emit(events::CADDY_STATUS_CHANGED, ()).ok();
                    }
                    _ => {}
                }
            }
        });

        self.process = Some(CaddyProcess {
            pid,
            started_at: Instant::now(),
            child: Some(child),
            alive: alive.clone(),
            expected_exit,
        });

        let client = super::Client::new(&config.caddy_admin);
        let readiness = wait_for_admin(&client, &alive, Duration::from_secs(15)).await;
        let _ = std::fs::remove_file(config_path);
        if let Err(error) = readiness {
            logger.error(
                "system",
                &format!(
                    "{}；应用将停止本次启动的 Caddy 子进程 (PID: {})",
                    error, pid
                ),
            );
            self.stop().await?;
            return Err(error);
        }

        tracing::info!("Caddy started (PID: {})", pid);
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        self.desired_running = false;
        self.recovering = false;
        if let Some(process) = self.process.as_mut() {
            stop_process(process, Duration::from_secs(10)).await?;
            // Keep the PID/alive state on failure so an unsuccessful stop is
            // never reported as stopped or followed by a second child process.
            self.process = None;
            tracing::info!("Caddy stopped and exit confirmed");
        }
        Ok(())
    }

    pub async fn restart(&mut self, logger: Arc<Logger>, config: &Config) -> Result<()> {
        self.stop().await?;
        self.start(logger, config).await
    }

    pub fn is_running(&self) -> bool {
        self.process
            .as_ref()
            .map(|p| p.alive.load(Ordering::SeqCst))
            .unwrap_or(false)
    }

    pub fn pid(&self) -> u32 {
        self.process
            .as_ref()
            .filter(|p| p.alive.load(Ordering::SeqCst))
            .map(|p| p.pid)
            .unwrap_or(0)
    }

    pub fn uptime_secs(&self) -> u64 {
        self.process
            .as_ref()
            .filter(|p| p.alive.load(Ordering::SeqCst))
            .map(|p| p.started_at.elapsed().as_secs())
            .unwrap_or(0)
    }

    pub fn managed(&self) -> bool {
        self.is_running()
    }
    pub async fn recover_if_needed(&mut self, logger: Arc<Logger>, config: &Config) {
        if self.is_running() {
            if self.uptime_secs() >= 60 {
                self.recovery_attempts = 0;
                self.recovery_exhausted = false;
            }
            return;
        }
        let crashed = self.recovering
            || self.process.as_ref().is_some_and(|process| {
                !process.alive.load(Ordering::SeqCst)
                    && !process.expected_exit.load(Ordering::SeqCst)
            });
        if !self.desired_running
            || !crashed
            || !config.settings.caddy.auto_restart
            || self.next_retry.is_some_and(|time| Instant::now() < time)
        {
            return;
        }
        if self.recovery_attempts >= config.settings.caddy.restart_attempts {
            if !self.recovery_exhausted {
                logger.error("system", "Caddy 自动恢复次数已用完，请检查日志后手动启动");
                self.recovery_exhausted = true;
            }
            return;
        }
        // Never take over an external instance that appeared while our child was down.
        if super::Client::new(&config.caddy_admin)
            .health_check()
            .await
            .is_ok()
        {
            self.desired_running = false;
            logger.warn("system", "管理地址出现外部 Caddy，已停止自动恢复");
            return;
        }
        let attempt = self.recovery_attempts + 1;
        logger.warn(
            "system",
            &format!(
                "正在自动恢复 Caddy（{}/{}）",
                attempt, config.settings.caddy.restart_attempts
            ),
        );
        let result = self.start(logger.clone(), config).await;
        self.recovery_attempts = attempt;
        self.desired_running = true;
        self.recovering = result.is_err();
        self.next_retry = Some(Instant::now() + Duration::from_secs(2u64.pow(attempt.min(5))));
        match result {
            Ok(()) => {
                logger.info("system", "Caddy 已自动恢复，代理配置已重新生效");
                self.app.emit(events::CADDY_STATUS_CHANGED, ()).ok();
            }
            Err(error) => logger.error("system", &format!("Caddy 自动恢复失败: {:#}", error)),
        }
    }
}

async fn stop_process(process: &mut CaddyProcess, timeout: Duration) -> Result<()> {
    if !process.alive.load(Ordering::SeqCst) {
        return Ok(());
    }
    process.expected_exit.store(true, Ordering::SeqCst);
    // The child handle identifies our instance; never stop by process name or
    // the configured admin port. kill() requests termination but does not wait.
    if let Some(child) = process.child.take() {
        if let Err(error) = child.kill() {
            if process.alive.load(Ordering::SeqCst) {
                process.expected_exit.store(false, Ordering::SeqCst);
                anyhow::bail!("停止 Caddy 子进程失败（PID: {}）: {}", process.pid, error);
            }
        }
    }
    let deadline = tokio::time::Instant::now() + timeout;
    while process.alive.load(Ordering::SeqCst) {
        if tokio::time::Instant::now() >= deadline {
            anyhow::bail!(
                "等待 Caddy 子进程退出超时（PID: {}），尚未确认进程已结束",
                process.pid
            );
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    Ok(())
}

async fn wait_for_admin(
    client: &super::Client,
    alive: &AtomicBool,
    startup_timeout: Duration,
) -> Result<()> {
    let deadline = tokio::time::Instant::now() + startup_timeout;
    let mut last_error = "尚未收到管理接口响应".to_string();
    loop {
        if !alive.load(Ordering::SeqCst) {
            anyhow::bail!("Caddy 进程在管理接口就绪前退出，请查看 Caddy 错误日志");
        }
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        // A 300ms per-request timeout cancels IPv4/IPv6 fallback and slow DNS
        // before a healthy localhost admin can respond. Bound the entire wait.
        last_error = match tokio::time::timeout_at(deadline, client.health_check()).await {
            Ok(Ok(())) => {
                if alive.load(Ordering::SeqCst) {
                    return Ok(());
                }
                anyhow::bail!("Caddy 进程在管理接口就绪前退出，请查看 Caddy 错误日志");
            }
            Ok(Err(error)) => format!("{:#}", error),
            Err(_) => "管理接口请求超时".to_string(),
        };
        let now = tokio::time::Instant::now();
        tokio::time::sleep_until(deadline.min(now + Duration::from_millis(100))).await;
    }
    anyhow::bail!(
        "等待 Caddy 管理接口 {} 就绪超时（{} 秒）；最后错误: {}",
        client.admin_url(),
        startup_timeout.as_secs_f64(),
        last_error
    )
}

fn log_caddy_output(logger: &Logger, fallback_level: LogLevel, line: Vec<u8>) {
    let message = String::from_utf8_lossy(&line).trim().to_string();
    if message.is_empty() {
        return;
    }

    match serde_json::from_str::<Value>(&message) {
        Ok(value) => {
            let level = caddy_log_level(&value).unwrap_or(fallback_level);
            logger.log_caddy(level, value, |value| {
                format_caddy_log_message(value, &message)
            });
        }
        Err(_) => logger.log(fallback_level, "caddy", &message),
    }
}

fn caddy_log_level(value: &Value) -> Option<LogLevel> {
    value
        .get("level")
        .and_then(Value::as_str)
        .map(|level| match level {
            "debug" => LogLevel::Debug,
            "warn" => LogLevel::Warn,
            "error" | "fatal" | "panic" | "dpanic" => LogLevel::Error,
            _ => LogLevel::Info,
        })
}

fn format_caddy_log_message(value: &Value, fallback: &str) -> String {
    if let Some(message) = format_access_log(value) {
        return message;
    }

    let msg = value.get("msg").and_then(Value::as_str).unwrap_or(fallback);
    let translated = translate_caddy_message(msg);
    let logger_name = value.get("logger").and_then(Value::as_str);
    let mut details = caddy_log_details(value);
    if let Some(request) = value.get("request") {
        for (field, label) in [("method", "方法"), ("uri", "路径"), ("remote_ip", "来源")] {
            if let Some(text) = request.get(field).and_then(Value::as_str) {
                details.push(format!("{} {}", label, text));
            }
        }
    }

    let mut message = match logger_name {
        Some(name) if !name.is_empty() => format!("[{}] {}", name, translated),
        _ => translated.to_string(),
    };

    if !details.is_empty() {
        message.push_str(" (");
        message.push_str(&details.join(", "));
        message.push(')');
    }

    message
}

fn format_access_log(value: &Value) -> Option<String> {
    if !value
        .get("logger")
        .and_then(Value::as_str)
        .is_some_and(|name| name.starts_with("http.log.access"))
    {
        return None;
    }
    let request = value.get("request")?;
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("HTTP");
    let uri = value
        .get("cpt_original_uri")
        .or_else(|| request.get("uri"))
        .and_then(Value::as_str)
        .unwrap_or("/");
    let host = request.get("host").and_then(Value::as_str).unwrap_or("");
    let remote = request
        .get("remote_ip")
        .or_else(|| request.get("client_ip"))
        .and_then(Value::as_str);
    let status = value.get("status").and_then(Value::as_i64);
    let duration = value.get("duration").and_then(Value::as_f64);

    let target = if host.is_empty() {
        uri.to_string()
    } else {
        format!("{}{}", host, uri)
    };

    let mut parts = Vec::new();
    if let Some(environment) = route_log_value(value, "cpt_environment") {
        parts.push(format!("环境 {}", environment));
    }
    if let Some(backend) = route_log_value(value, "cpt_backend") {
        parts.push(format!("后端 {}", backend));
    }
    if let Some(status) = status {
        parts.push(format!("状态 {}", status));
    }
    if let Some(duration) = duration {
        parts.push(format_duration(duration));
    }
    if let Some(remote) = remote {
        parts.push(format!("来源 {}", remote));
    }

    let suffix = if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join(", "))
    };

    Some(match route_log_value(value, "cpt_project") {
        Some(project) => format!("{} · {} {}{}", project, method, uri, suffix),
        None => format!("请求 {} {}{}", method, target, suffix),
    })
}

fn route_log_value(value: &Value, key: &str) -> Option<String> {
    let text = value.get(key)?.as_str()?;
    if value.get("cpt_metadata_encoding").and_then(Value::as_str) == Some("url") {
        url::form_urlencoded::parse(format!("value={}", text).as_bytes())
            .next()
            .map(|(_, value)| value.into_owned())
    } else {
        Some(text.to_string())
    }
}

fn translate_caddy_message(message: &str) -> &str {
    match message {
        "admin endpoint started" => "Admin API 已启动",
        "admin endpoint disabled" => "Admin API 已禁用",
        "adapted config to JSON" => "配置已转换为 JSON",
        "autosaved config (load with --resume flag)" => "配置已自动保存",
        "cleaning storage unit" => "正在清理证书存储",
        "config is unchanged" => "配置未变化",
        "config load finalized" => "配置加载完成",
        "finished cleaning storage units" => "证书存储清理完成",
        "loading initial config" => "正在加载初始配置",
        "serving initial configuration" => "初始配置已生效",
        "server running" => "HTTP 服务已启动",
        "shutdown complete" => "Caddy 已关闭",
        "shutting down apps, then terminating" => "正在停止 Caddy 应用",
        "started background certificate maintenance" => "证书维护任务已启动",
        "stopped background certificate maintenance" => "证书维护任务已停止",
        "using config from file" => "正在读取配置文件",
        "received request" => "收到管理请求",
        "load complete" => "配置重载完成",
        "stopped previous server" => "旧管理服务已停止",
        _ => message,
    }
}

fn caddy_log_details(value: &Value) -> Vec<String> {
    [
        ("address", "地址"),
        ("file", "文件"),
        ("adapter", "适配器"),
        ("server_name", "服务"),
        ("proto", "协议"),
        ("status", "状态"),
        ("error", "错误"),
        ("method", "方法"),
        ("uri", "路径"),
    ]
    .iter()
    .filter_map(|(key, label)| {
        value
            .get(*key)
            .and_then(format_json_scalar)
            .map(|text| format!("{} {}", label, text))
    })
    .collect()
}

fn format_json_scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Array(values) => {
            let text = values
                .iter()
                .filter_map(format_json_scalar)
                .collect::<Vec<_>>()
                .join(", ");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn format_duration(seconds: f64) -> String {
    if seconds < 1.0 {
        format!("{:.1}ms", seconds * 1000.0)
    } else {
        format!("{:.2}s", seconds)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        caddy_log_level, format_caddy_log_message, stop_process, wait_for_admin, CaddyProcess,
    };
    use crate::model::LogLevel;
    use serde_json::json;
    use std::sync::atomic::AtomicBool;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn stopping_a_child_waits_for_termination_before_returning() {
        use std::sync::{atomic::Ordering, Arc};
        use tauri_plugin_shell::{process::CommandEvent, ShellExt};
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_shell::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let binary = crate::test_support::caddy_binary();
        let directory = crate::test_support::Directory::new();
        let config = directory.0.join("stop-test.json");
        std::fs::write(
            &config,
            r#"{"admin":{"disabled":true,"config":{"persist":false}}}"#,
        )
        .unwrap();
        let (mut events, child) = app
            .shell()
            .command(binary)
            .args(["run", "--config", config.to_str().unwrap()])
            .env("APPDATA", &directory.0)
            .env("XDG_CONFIG_HOME", &directory.0)
            .env("XDG_DATA_HOME", &directory.0)
            .spawn()
            .unwrap();
        let alive = Arc::new(AtomicBool::new(true));
        let observed = alive.clone();
        let listener = tokio::spawn(async move {
            while let Some(event) = events.recv().await {
                if matches!(event, CommandEvent::Terminated(_)) {
                    // Make the difference between requesting a kill and
                    // observing exit deterministic, including on fast machines.
                    tokio::time::sleep(Duration::from_millis(120)).await;
                    observed.store(false, Ordering::SeqCst);
                    break;
                }
            }
        });
        let mut process = CaddyProcess {
            pid: child.pid(),
            started_at: std::time::Instant::now(),
            child: Some(child),
            alive,
            expected_exit: Arc::new(AtomicBool::new(false)),
        };
        stop_process(&mut process, Duration::from_secs(5))
            .await
            .unwrap();
        assert!(!process.alive.load(Ordering::SeqCst));
        assert!(process.expected_exit.load(Ordering::SeqCst));
        listener.await.unwrap();
    }

    #[tokio::test]
    async fn an_unconfirmed_exit_fails_instead_of_allowing_installation() {
        use std::sync::{atomic::Ordering, Arc};
        let mut process = CaddyProcess {
            pid: 123,
            started_at: std::time::Instant::now(),
            child: None,
            alive: Arc::new(AtomicBool::new(true)),
            expected_exit: Arc::new(AtomicBool::new(false)),
        };
        let error = stop_process(&mut process, Duration::from_millis(30))
            .await
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("123") && error.contains("退出超时"),
            "{error}"
        );
        assert!(process.alive.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn startup_accepts_delayed_admin_response() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client = crate::caddy::Client::new(&listener.local_addr().unwrap().to_string());
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 4096];
            stream.read(&mut request).await.unwrap();
            tokio::time::sleep(Duration::from_millis(600)).await;
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
                .await;
        });
        let ready = wait_for_admin(&client, &AtomicBool::new(true), Duration::from_secs(5)).await;
        task.abort();
        ready.expect(
            "a responsive admin must survive startup checking even if a request takes over 300ms",
        );
    }

    #[tokio::test]
    async fn real_caddy_localhost_passes_startup_and_records_proxy_requests() {
        use crate::test_support::{Directory, Process};
        use std::process::{Command, Stdio};
        let target = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => "caddy-x86_64-pc-windows-msvc.exe",
            ("linux", "x86_64") => "caddy-x86_64-unknown-linux-gnu",
            ("macos", "aarch64") => "caddy-aarch64-apple-darwin",
            ("macos", "x86_64") => "caddy-x86_64-apple-darwin",
            _ => return,
        };
        let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(target);
        if !binary.exists() {
            eprintln!("Caddy sidecar absent; run pnpm download-caddy to enable integration test");
            return;
        }
        let admin_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let proxy_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = admin_listener.local_addr().unwrap().port();
        let proxy_port = proxy_listener.local_addr().unwrap().port();
        let backend = crate::test_support::server(|_| (200, json!({"ok": true}))).await;
        let mut project = crate::caddy::generator::tests::project(
            "requests",
            false,
            &format!("http://{}", backend.address),
        );
        project.listen = format!("127.0.0.1:{}", proxy_port);
        let admin = format!("localhost:{}", port);
        let directory = Directory::new();
        let file = directory.0.join("caddy.json");
        let mut config = crate::caddy::generator::generate_caddy_config(&crate::model::Config {
            caddy_admin: admin.clone(),
            projects: std::collections::HashMap::from([("requests".into(), project)]),
            ..crate::model::Config::default()
        });
        config["admin"]["config"] = json!({"persist": false});
        std::fs::write(&file, serde_json::to_vec(&config).unwrap()).unwrap();
        let log = directory.0.join("caddy.log");
        drop((admin_listener, proxy_listener));
        let mut child = Process(
            Command::new(binary)
                .args(["run", "--config"])
                .arg(file)
                .env("APPDATA", &directory.0)
                .env("XDG_CONFIG_HOME", &directory.0)
                .env("XDG_DATA_HOME", &directory.0)
                .stdout(Stdio::null())
                .stderr(std::fs::File::create(&log).unwrap())
                .spawn()
                .unwrap(),
        );
        let client = crate::caddy::Client::new(&admin);
        let ready = wait_for_admin(&client, &AtomicBool::new(true), Duration::from_secs(5)).await;
        assert!(
            ready.is_ok(),
            "startup check rejected a real Caddy on localhost: {:?}\n{}",
            ready,
            std::fs::read_to_string(&log).unwrap_or_default()
        );
        tokio::time::sleep(Duration::from_millis(600)).await;
        assert!(child.0.try_wait().unwrap().is_none());
        client.health_check().await.unwrap();
        client.get_config().await.unwrap();
        let response = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{}/api/status?check=1",
                proxy_port
            ))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
        assert_eq!(response.version(), reqwest::Version::HTTP_11);
        response.bytes().await.unwrap();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            let output = std::fs::read_to_string(&log).unwrap();
            assert!(
                !output.contains("skipped because it requires TLS"),
                "plaintext proxy configuration emitted misleading TLS warnings:\n{}",
                output
            );
            let recorded = output
                .lines()
                .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                .any(|entry| {
                    entry["logger"]
                        .as_str()
                        .is_some_and(|logger| logger.starts_with("http.log.access"))
                        && entry["request"]["uri"] == "/api/status?check=1"
                        && entry["status"] == 200
                        && entry["duration"].is_number()
                });
            if recorded {
                break;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "proxy request was not logged:\n{}",
                output
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    #[tokio::test]
    async fn startup_timeout_reports_the_admin_address_and_last_failure() {
        let server = crate::test_support::server(|_| (503, json!({"error": "not ready"}))).await;
        let client = crate::caddy::Client::new(&server.address);
        let error = wait_for_admin(&client, &AtomicBool::new(true), Duration::from_millis(350))
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains(&server.address), "{}", error);
        assert!(error.contains("503"), "{}", error);
    }

    #[tokio::test]
    async fn startup_reports_a_child_that_has_exited() {
        let client = crate::caddy::Client::new("127.0.0.1:1");
        let error = wait_for_admin(&client, &AtomicBool::new(false), Duration::from_secs(15))
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains("进程在管理接口就绪前退出"), "{}", error);
    }

    #[test]
    fn formats_caddy_admin_log() {
        let value = json!({
            "level": "info",
            "logger": "admin",
            "msg": "admin endpoint started",
            "address": "localhost:2019"
        });

        assert_eq!(
            caddy_log_level(&value).unwrap().to_string(),
            LogLevel::Info.to_string()
        );
        assert_eq!(
            format_caddy_log_message(&value, ""),
            "[admin] Admin API 已启动 (地址 localhost:2019)"
        );
    }

    #[test]
    fn formats_caddy_access_log() {
        let value = json!({
            "level": "info",
            "logger": "http.log.access",
            "msg": "handled request",
            "request": {
                "method": "GET",
                "host": "localhost:20000",
                "uri": "/api/status",
                "remote_ip": "127.0.0.1"
            },
            "status": 200,
            "duration": 0.012
        });

        assert_eq!(
            format_caddy_log_message(&value, ""),
            "请求 GET localhost:20000/api/status (状态 200, 12.0ms, 来源 127.0.0.1)"
        );
    }

    #[test]
    fn request_summary_uses_the_captured_project_environment_and_original_uri() {
        let encode = |value: &str| {
            url::form_urlencoded::byte_serialize(value.as_bytes()).collect::<String>()
        };
        let value = json!({"logger":"http.log.access", "cpt_metadata_encoding":"url", "cpt_project":encode("客服{http.request.host}"), "cpt_environment":encode("测试环境"), "cpt_backend":encode("https://api.example.com/v2/"), "cpt_original_uri":"/客服/users?q=1", "request":{"method":"POST","uri":"/v2/users?q=1"}, "status":201,"duration":0.032});
        let message = format_caddy_log_message(&value, "");
        assert!(
            message.starts_with("客服{http.request.host} · POST /客服/users?q=1"),
            "{}",
            message
        );
        assert!(
            message.contains("测试环境")
                && message.contains("https://api.example.com/v2/")
                && message.contains("32.0ms"),
            "{}",
            message
        );
    }

    #[test]
    fn request_errors_preserve_the_upstream_failure_instead_of_becoming_access_summaries() {
        let value = json!({"level": "error", "logger": "http.log.error", "msg": "dial tcp 127.0.0.1:3000: connect: connection refused", "request": {"method": "GET", "uri": "/api"}, "status": 502, "error": "connection refused"});
        let display = format_caddy_log_message(&value, "");
        assert!(display.contains("connection refused"), "{}", display);
        assert!(display.contains("502"), "{}", display);
        assert!(display.contains("/api"), "{}", display);
        assert_eq!(
            caddy_log_level(&json!({"level": "fatal"}))
                .unwrap()
                .to_string(),
            "ERROR"
        );
    }
}
