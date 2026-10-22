pub use crate::preferences::{AppSettings, HealthOverride, ProxyOptions};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default = "default_caddy_admin")]
    pub caddy_admin: String,
    #[serde(default)]
    pub projects: HashMap<String, Project>,
}

fn default_caddy_admin() -> String {
    "localhost:2019".to_string()
}

fn default_insecure_skip_verify() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub proxy: ProxyOptions,
    #[serde(default)]
    pub health: HealthOverride,
    #[serde(default)]
    pub route_prefix: Option<String>,
    #[serde(default)]
    pub rewrite_prefix: Option<String>,
    pub name: String,
    pub listen: String,
    #[serde(default = "default_project_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub path_prefix: bool,
    #[serde(default)]
    pub strip_prefix: bool,
    #[serde(default)]
    pub desc: String,
    #[serde(default)]
    pub environments: HashMap<String, Environment>,
    #[serde(default)]
    pub current: String,
}

fn default_project_enabled() -> bool {
    true
}

impl Project {
    pub fn route_path(&self) -> Option<String> {
        self.route_prefix
            .clone()
            .or_else(|| self.path_prefix.then(|| format!("/{}", self.name)))
    }
    pub fn has_proxy_route(&self) -> bool {
        self.enabled && self.environments.contains_key(&self.current)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectActivation {
    pub project: Project,
    pub applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub proxy: ProxyOptions,
    #[serde(default)]
    pub health: HealthOverride,
    pub addr: String,
    #[serde(default)]
    pub desc: String,
    #[serde(default = "default_insecure_skip_verify")]
    pub insecure_skip_verify: bool,
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
    pub id: u64,
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub category: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogSource {
    Runtime,
    Caddy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogClearResult {
    pub source: Option<LogSource>,
    pub through_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub name: String,
    pub listen: String,
    pub enabled: bool,
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
    pub applied: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            settings: AppSettings::default(),
            caddy_admin: default_caddy_admin(),
            projects: HashMap::new(),
        }
    }
}
