use crate::logger::Logger;
use crate::model::HealthStatus;
use crate::store::Store;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

pub struct HealthChecker {
    interval: Duration,
    results: HashMap<String, HashMap<String, HealthStatus>>,
    http: reqwest::Client,
    running: bool,
}

impl HealthChecker {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            results: HashMap::new(),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("failed to create HTTP client"),
            running: false,
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

            let interval = {
                let checker = checker.read().await;
                if !checker.running {
                    break;
                }
                checker.interval
            };

            tokio::time::sleep(interval).await;

            if !checker.read().await.running {
                break;
            }
        }
    }

    pub fn stop(&mut self) {
        self.running = false;
    }

    async fn check_all_shared(
        checker: &Arc<RwLock<Self>>,
        store: &Arc<RwLock<Store>>,
        logger: &Logger,
        app: &AppHandle,
    ) {
        let config = store.read().await.get_config().clone();
        let (http, old_results) = {
            let checker = checker.read().await;
            (checker.http.clone(), checker.results.clone())
        };
        let mut next_results: HashMap<String, HashMap<String, HealthStatus>> = HashMap::new();
        let mut changed_events = Vec::new();

        for (project_name, project) in &config.projects {
            for (env_name, env) in &project.environments {
                let status = check_backend(&http, &env.addr).await;

                let old_status = old_results
                    .get(project_name)
                    .and_then(|envs| envs.get(env_name))
                    .cloned();

                next_results
                    .entry(project_name.clone())
                    .or_default()
                    .insert(env_name.clone(), status.clone());

                let changed = match &old_status {
                    Some(old) => old.healthy != status.healthy,
                    None => true,
                };

                if changed {
                    changed_events.push((project_name.clone(), env_name.clone(), status));
                }
            }
        }

        checker.write().await.results = next_results;

        for (project_name, env_name, status) in changed_events {
            if status.healthy {
                logger.info(
                    "health",
                    &format!(
                        "后端健康: {}/{} (延迟: {}ms)",
                        project_name, env_name, status.latency_ms
                    ),
                );
            } else {
                logger.warn(
                    "health",
                    &format!(
                        "后端异常: {}/{} - {}",
                        project_name,
                        env_name,
                        status.error.as_deref().unwrap_or("unknown")
                    ),
                );
            }

            app.emit(
                "health.changed",
                serde_json::json!({
                    "project": project_name,
                    "environment": env_name,
                    "status": status,
                }),
            )
            .ok();
        }
    }

    pub fn get_status(&self) -> &HashMap<String, HashMap<String, HealthStatus>> {
        &self.results
    }

    pub fn get_project_status(&self, project: &str) -> Option<&HashMap<String, HealthStatus>> {
        self.results.get(project)
    }

    pub fn get_env_status(&self, project: &str, env: &str) -> Option<&HealthStatus> {
        self.results.get(project).and_then(|envs| envs.get(env))
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

fn parse_health_url(addr: &str) -> String {
    let value = addr.trim().trim_end_matches('/');
    let candidate = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("http://{}", value)
    };

    if let Ok(mut url) = url::Url::parse(&candidate) {
        url.set_query(None);
        url.set_fragment(None);
        return url.as_str().trim_end_matches('/').to_string();
    }

    candidate
}

async fn check_backend(http: &reqwest::Client, addr: &str) -> HealthStatus {
    let base_url = parse_health_url(addr);
    let start = std::time::Instant::now();

    let health_url = format!("{}/health", base_url);
    let result = http.get(&health_url).send().await;

    let latency = start.elapsed().as_millis() as i64;

    let resp = match result {
        Ok(resp) => resp,
        Err(_) => match http.get(&format!("{}/", base_url)).send().await {
            Ok(resp) => resp,
            Err(e) => {
                return HealthStatus {
                    healthy: false,
                    last_check: Utc::now(),
                    error: Some(e.to_string()),
                    latency_ms: latency,
                };
            }
        },
    };

    let healthy = resp.status().as_u16() < 400;

    HealthStatus {
        healthy,
        last_check: Utc::now(),
        error: if healthy {
            None
        } else {
            Some(format!("HTTP {}", resp.status()))
        },
        latency_ms: latency,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_health_url;

    #[test]
    fn parse_health_url_preserves_ports() {
        assert_eq!(
            parse_health_url("http://localhost:3000"),
            "http://localhost:3000"
        );
        assert_eq!(
            parse_health_url("https://api.example.com:8443/base/"),
            "https://api.example.com:8443/base"
        );
        assert_eq!(parse_health_url("127.0.0.1:8080"), "http://127.0.0.1:8080");
    }
}
