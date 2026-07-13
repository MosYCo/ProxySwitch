use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_caddy_admin")]
    pub caddy_admin: String,
    #[serde(default)]
    pub projects: HashMap<String, Project>,
}

fn default_caddy_admin() -> String {
    "localhost:2019".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub name: String,
    pub listen: String,
    #[serde(default)]
    pub desc: String,
    #[serde(default)]
    pub environments: HashMap<String, Environment>,
    #[serde(default)]
    pub current: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub addr: String,
    #[serde(default)]
    pub desc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub healthy: bool,
    pub last_check: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub latency_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub category: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub name: String,
    pub listen: String,
    pub current_env: String,
    pub backend_addr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaddyStatus {
    pub running: bool,
    pub managed: bool,
    pub pid: u32,
    pub uptime_secs: u64,
    pub reachable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaddySettings {
    pub admin: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            caddy_admin: default_caddy_admin(),
            projects: HashMap::new(),
        }
    }
}
