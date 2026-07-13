use anyhow::Result;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::logger::Logger;
use crate::model::LogLevel;

pub struct CaddyProcess {
    pid: u32,
    started_at: Instant,
    child: CommandChild,
}

pub struct Manager {
    app: AppHandle,
    process: Option<CaddyProcess>,
}

impl Manager {
    pub fn new(app: AppHandle) -> Self {
        Self { app, process: None }
    }

    pub async fn start(&mut self, logger: Arc<Logger>) -> Result<()> {
        if self.process.is_some() {
            return Ok(());
        }

        let shell = self.app.shell();
        let sidecar = shell
            .sidecar("caddy")
            .map_err(|e| anyhow::anyhow!("failed to create caddy sidecar: {}", e))?;

        let (mut rx, child) = sidecar
            .args(["run"])
            .spawn()
            .map_err(|e| anyhow::anyhow!("failed to spawn caddy: {}", e))?;

        let log_sink = logger.clone();
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
                        log_sink.error("caddy", &format!("Caddy 输出读取失败: {}", error));
                    }
                    CommandEvent::Terminated(payload) => {
                        log_sink.warn(
                            "caddy",
                            &format!("Caddy 进程已退出，退出码: {:?}", payload.code),
                        );
                    }
                    _ => {}
                }
            }
        });

        // Give Caddy a moment to start
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let pid = child.pid();

        self.process = Some(CaddyProcess {
            pid,
            started_at: Instant::now(),
            child,
        });

        tracing::info!("Caddy started (PID: {})", pid);
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(proc) = self.process.take() {
            // Try graceful stop via caddy stop command
            let shell = self.app.shell();
            if let Ok(stop_cmd) = shell.sidecar("caddy") {
                if let Ok((rx, _child)) = stop_cmd.args(["stop"]).spawn() {
                    // Wait briefly for graceful stop
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    drop(rx);
                }
            }

            // Kill the process as fallback
            proc.child.kill().ok();
            tracing::info!("Caddy stopped");
        }
        Ok(())
    }

    pub async fn restart(&mut self, logger: Arc<Logger>) -> Result<()> {
        self.stop().await?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        self.start(logger).await
    }

    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }

    pub fn pid(&self) -> u32 {
        self.process.as_ref().map(|p| p.pid).unwrap_or(0)
    }

    pub fn uptime_secs(&self) -> u64 {
        self.process
            .as_ref()
            .map(|p| p.started_at.elapsed().as_secs())
            .unwrap_or(0)
    }

    pub fn managed(&self) -> bool {
        self.process.is_some()
    }
}

fn log_caddy_output(logger: &Logger, fallback_level: LogLevel, line: Vec<u8>) {
    let message = String::from_utf8_lossy(&line).trim().to_string();
    if message.is_empty() {
        return;
    }

    let level = serde_json::from_str::<serde_json::Value>(&message)
        .ok()
        .and_then(|value| value.get("level").and_then(|level| level.as_str()).map(str::to_string))
        .map(|level| match level.as_str() {
            "debug" => LogLevel::Debug,
            "warn" => LogLevel::Warn,
            "error" => LogLevel::Error,
            _ => LogLevel::Info,
        })
        .unwrap_or(fallback_level);

    logger.log(level, "caddy", &message);
}
