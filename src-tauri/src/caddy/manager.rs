use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::logger::Logger;
use crate::model::LogLevel;
use serde_json::Value;

pub struct CaddyProcess {
    pid: u32,
    started_at: Instant,
    child: CommandChild,
    alive: Arc<AtomicBool>,
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

        let (mut rx, child) = sidecar
            .args(["run"])
            .spawn()
            .map_err(|e| anyhow::anyhow!("failed to spawn caddy: {}", e))?;

        let alive = Arc::new(AtomicBool::new(true));
        let alive_for_task = alive.clone();
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
                        alive_for_task.store(false, Ordering::SeqCst);
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
            alive,
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
}

fn log_caddy_output(logger: &Logger, fallback_level: LogLevel, line: Vec<u8>) {
    let message = String::from_utf8_lossy(&line).trim().to_string();
    if message.is_empty() {
        return;
    }

    match serde_json::from_str::<Value>(&message) {
        Ok(value) => {
            let level = caddy_log_level(&value).unwrap_or(fallback_level);
            let display = format_caddy_log_message(&value, &message);
            logger.log_with_data(level, "caddy", &display, Some(value));
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
            "error" => LogLevel::Error,
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
    let details = caddy_log_details(value);

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
    let request = value.get("request")?;
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("HTTP");
    let uri = request.get("uri").and_then(Value::as_str).unwrap_or("/");
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

    Some(format!("请求 {} {}{}", method, target, suffix))
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
    use super::{caddy_log_level, format_caddy_log_message};
    use crate::model::LogLevel;
    use serde_json::json;

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
}
