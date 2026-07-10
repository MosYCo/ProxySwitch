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

    pub async fn start(&mut self, store: Arc<RwLock<Store>>, logger: Arc<Logger>, app: AppHandle) {
        self.running = true;

        // Initial check
        self.check_all(&store, &logger, &app).await;

        // Periodic checks
        loop {
            if !self.running {
                break;
            }
            tokio::time::sleep(self.interval).await;
            if !self.running {
                break;
            }
            self.check_all(&store, &logger, &app).await;
        }
    }

    pub fn stop(&mut self) {
        self.running = false;
    }

    async fn check_all(&mut self, store: &Arc<RwLock<Store>>, logger: &Logger, app: &AppHandle) {
        let config = store.read().await.get_config().clone();

        for (project_name, project) in &config.projects {
            for (env_name, env) in &project.environments {
                let status = self.check_backend(&env.addr).await;

                let old_status = self
                    .results
                    .get(project_name)
                    .and_then(|envs| envs.get(env_name))
                    .cloned();

                self.results
                    .entry(project_name.clone())
                    .or_default()
                    .insert(env_name.clone(), status.clone());

                // Notify on status change
                let changed = match &old_status {
                    Some(old) => old.healthy != status.healthy,
                    None => true,
                };

                if changed {
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
        }
    }

    async fn check_backend(&self, addr: &str) -> HealthStatus {
        let base_url = parse_health_url(addr);
        let start = std::time::Instant::now();

        // Try /health endpoint first
        let health_url = format!("{}/health", base_url);
        let result = self.http.get(&health_url).send().await;

        let latency = start.elapsed().as_millis() as i64;

        let resp = match result {
            Ok(resp) => resp,
            Err(_) => {
                // Fallback to root
                match self.http.get(&format!("{}/", base_url)).send().await {
                    Ok(resp) => resp,
                    Err(e) => {
                        return HealthStatus {
                            healthy: false,
                            last_check: Utc::now(),
                            error: Some(e.to_string()),
                            latency_ms: latency,
                        };
                    }
                }
            }
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

    pub fn get_status(&self) -> &HashMap<String, HashMap<String, HealthStatus>> {
        &self.results
    }

    pub fn get_project_status(&self, project: &str) -> Option<&HashMap<String, HealthStatus>> {
        self.results.get(project)
    }

    pub fn get_env_status(&self, project: &str, env: &str) -> Option<&HealthStatus> {
        self.results.get(project).and_then(|envs| envs.get(env))
    }

    pub async fn force_check(
        &mut self,
        store: &Arc<RwLock<Store>>,
        logger: &Logger,
        app: &AppHandle,
    ) {
        self.check_all(store, logger, app).await;
    }
}

fn parse_health_url(addr: &str) -> String {
    if addr.starts_with("http://") || addr.starts_with("https://") {
        if let Ok(url) = url::Url::parse(addr) {
            return format!(
                "{}://{}",
                url.scheme(),
                url.host_str().unwrap_or("localhost")
            );
        }
    }
    format!("http://{}", addr)
}
