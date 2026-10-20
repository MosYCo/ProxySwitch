use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct AppSettings {
    pub startup: StartupSettings,
    pub logs: LogSettings,
    pub health: HealthSettings,
    pub backup: BackupSettings,
    pub caddy: EngineSettings,
    pub proxy: ProxyOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct StartupSettings {
    pub launch_at_login: bool,
    pub start_caddy: bool,
    pub start_hidden: bool,
    pub close_action: String,
}
impl Default for StartupSettings {
    fn default() -> Self {
        Self {
            launch_at_login: false,
            start_caddy: true,
            start_hidden: false,
            close_action: "tray".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct LogSettings {
    pub requests_enabled: bool,
    pub entries_per_source: usize,
    pub retention_days: u32,
    pub slow_request_ms: u64,
    pub ignored_paths: Vec<String>,
    pub redacted_query_params: Vec<String>,
    pub caddy_level: String,
}
impl Default for LogSettings {
    fn default() -> Self {
        Self {
            requests_enabled: true,
            entries_per_source: 500,
            retention_days: 0,
            slow_request_ms: 1000,
            ignored_paths: Vec::new(),
            redacted_query_params: ["token", "access_token", "password", "secret", "api_key"]
                .map(String::from)
                .to_vec(),
            caddy_level: "INFO".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct HealthSettings {
    pub enabled: bool,
    pub interval_secs: u64,
    pub timeout_ms: u64,
    pub path: String,
    pub expected_statuses: Vec<u16>,
    pub only_current: bool,
    pub fallback_to_root: bool,
}
impl Default for HealthSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_secs: 30,
            timeout_ms: 5000,
            path: "/health".into(),
            expected_statuses: Vec::new(),
            only_current: false,
            fallback_to_root: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct HealthOverride {
    pub enabled: Option<bool>,
    pub timeout_ms: Option<u64>,
    pub path: Option<String>,
    pub expected_statuses: Option<Vec<u16>>,
    pub fallback_to_root: Option<bool>,
}
impl HealthSettings {
    pub fn with_override(&self, value: &HealthOverride) -> Self {
        Self {
            enabled: value.enabled.unwrap_or(self.enabled),
            timeout_ms: value.timeout_ms.unwrap_or(self.timeout_ms),
            path: value.path.clone().unwrap_or_else(|| self.path.clone()),
            expected_statuses: value
                .expected_statuses
                .clone()
                .unwrap_or_else(|| self.expected_statuses.clone()),
            fallback_to_root: value.fallback_to_root.unwrap_or(self.fallback_to_root),
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct BackupSettings {
    pub enabled: bool,
    pub max_backups: usize,
}
impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            max_backups: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct EngineSettings {
    pub auto_restart: bool,
    pub restart_attempts: u32,
}
impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            auto_restart: false,
            restart_attempts: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct ProxyOptions {
    pub connect_timeout_ms: Option<u64>,
    pub response_timeout_ms: Option<u64>,
    pub host: Option<String>,
    // null removes a header; a string sets it. Keys are merged case-insensitively.
    pub request_headers: BTreeMap<String, Option<String>>,
    pub response_headers: BTreeMap<String, Option<String>>,
}
impl ProxyOptions {
    pub fn with_override(&self, next: &Self) -> Self {
        fn merge(
            base: &BTreeMap<String, Option<String>>,
            next: &BTreeMap<String, Option<String>>,
        ) -> BTreeMap<String, Option<String>> {
            base.iter()
                .chain(next)
                .map(|(key, value)| (key.to_ascii_lowercase(), value.clone()))
                .collect()
        }
        Self {
            connect_timeout_ms: next.connect_timeout_ms.or(self.connect_timeout_ms),
            response_timeout_ms: next.response_timeout_ms.or(self.response_timeout_ms),
            host: next.host.clone().or_else(|| self.host.clone()),
            request_headers: merge(&self.request_headers, &next.request_headers),
            response_headers: merge(&self.response_headers, &next.response_headers),
        }
    }
}

pub fn validate_settings(value: &AppSettings) -> Result<()> {
    if !["tray", "quit"].contains(&value.startup.close_action.as_str()) {
        bail!("关闭窗口行为无效");
    }
    if !(100..=10000).contains(&value.logs.entries_per_source) {
        bail!("日志缓存数量须为 100–10000");
    }
    if value.logs.retention_days > 365 {
        bail!("日志保留天数须为 0–365，0 表示不自动清理");
    }
    if !(1..=3600000).contains(&value.logs.slow_request_ms) {
        bail!("慢请求阈值须为 1–3600000 毫秒");
    }
    if !["DEBUG", "INFO", "WARN", "ERROR"].contains(&value.logs.caddy_level.as_str()) {
        bail!("Caddy 日志级别无效");
    }
    if !(5..=3600).contains(&value.health.interval_secs) {
        bail!("健康检查间隔须为 5–3600 秒");
    }
    validate_health(&HealthOverride {
        timeout_ms: Some(value.health.timeout_ms),
        path: Some(value.health.path.clone()),
        expected_statuses: Some(value.health.expected_statuses.clone()),
        ..Default::default()
    })?;
    if !(1..=100).contains(&value.backup.max_backups) {
        bail!("备份数量须为 1–100");
    }
    if !(1..=10).contains(&value.caddy.restart_attempts) {
        bail!("重试次数须为 1–10");
    }
    if value.logs.ignored_paths.len() > 100 || value.logs.redacted_query_params.len() > 100 {
        bail!("日志过滤规则最多各 100 条");
    }
    for path in &value.logs.ignored_paths {
        validate_path(
            if path == "/*" {
                "/"
            } else {
                path.strip_suffix("/*").unwrap_or(path)
            },
            "忽略路径",
        )?;
    }
    if value
        .logs
        .redacted_query_params
        .iter()
        .any(|key| key.trim().is_empty() || key.len() > 128)
    {
        bail!("脱敏参数名称无效");
    }
    validate_proxy(&value.proxy)
}
pub fn validate_path(path: &str, label: &str) -> Result<()> {
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.len() > 1024
        || path.contains(['?', '#', '*', '{', '}', '\\'])
        || path.contains(char::is_whitespace)
    {
        bail!(
            "{}须为以 / 开头的路径，不能包含空白、通配符、查询参数或片段",
            label
        );
    }
    if path.split('/').any(|part| part == "." || part == "..") {
        bail!("{}不能包含相对路径", label);
    }
    Ok(())
}
pub fn validate_health(value: &HealthOverride) -> Result<()> {
    if value
        .timeout_ms
        .is_some_and(|v| !(100..=60000).contains(&v))
    {
        bail!("健康检查超时须为 100–60000 毫秒");
    }
    if let Some(path) = &value.path {
        validate_path(path, "健康检查路径")?;
    }
    if let Some(statuses) = &value.expected_statuses {
        if statuses.len() > 100 || statuses.iter().any(|v| !(100..=599).contains(v)) {
            bail!("预期状态码须为 100–599");
        }
    }
    Ok(())
}
pub fn validate_proxy(value: &ProxyOptions) -> Result<()> {
    if value
        .connect_timeout_ms
        .is_some_and(|v| !(100..=300000).contains(&v))
    {
        bail!("连接超时须为 100–300000 毫秒");
    }
    if value.response_timeout_ms.is_some_and(|v| v > 3600000) {
        bail!("响应头超时须为 0–3600000 毫秒，0 表示不限时");
    }
    if let Some(host) = &value.host {
        if host.is_empty()
            || host.len() > 255
            || host.contains(['/', '\\', '?', '#', '{', '}'])
            || host.contains(char::is_whitespace)
        {
            bail!("Host 须为主机名，可带端口");
        }
    }
    for headers in [&value.request_headers, &value.response_headers] {
        if headers.len() > 100 {
            bail!("Header 规则最多 100 条");
        }
        let mut names = std::collections::HashSet::new();
        for (name, value) in headers {
            if name.is_empty()
                || !name
                    .bytes()
                    .all(|v| v.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&v))
                || !names.insert(name.to_ascii_lowercase())
            {
                bail!("Header 名称无效或重复: {}", name);
            }
            if name.eq_ignore_ascii_case("host") {
                bail!("请通过专用 Host 字段设置主机名");
            }
            if value
                .as_ref()
                .is_some_and(|v| v.contains(['\r', '\n', '\0']) || v.len() > 8192)
            {
                bail!("Header 值不能包含换行且不能超过 8192 字节");
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_config_gets_compatible_defaults_and_round_trips() {
        let config: crate::model::Config = serde_json::from_str(r#"{"projects":{"demo":{"name":"demo","listen":":8080","environments":{"dev":{"addr":"http://127.0.0.1:3000"}},"current":"dev"}}}"#).unwrap();
        assert!(config.settings.startup.start_caddy);
        assert_eq!(config.settings.logs.entries_per_source, 500);
        assert_eq!(config.settings.health.interval_secs, 30);
        assert!(config.projects["demo"].route_prefix.is_none());
        crate::validation::validate_config(&config).unwrap();
        let reloaded: crate::model::Config =
            serde_json::from_str(&serde_json::to_string(&config).unwrap()).unwrap();
        assert_eq!(reloaded.settings, config.settings);
    }
    #[test]
    fn header_inheritance_is_case_insensitive_and_keeps_explicit_deletions() {
        let mut base = ProxyOptions::default();
        base.request_headers
            .insert("X-Mode".into(), Some("global".into()));
        base.request_headers
            .insert("X-Keep".into(), Some("global".into()));
        base.response_timeout_ms = Some(5000);
        let mut project = ProxyOptions::default();
        project.request_headers.insert("x-mode".into(), None);
        project.response_timeout_ms = Some(0);
        let next = base.with_override(&project);
        assert_eq!(next.request_headers["x-mode"], None);
        assert_eq!(next.request_headers["x-keep"].as_deref(), Some("global"));
        assert_eq!(next.response_timeout_ms, Some(0));
    }
    #[test]
    fn settings_reject_unbounded_resource_usage_and_invalid_header_values() {
        let mut settings = AppSettings::default();
        settings.logs.entries_per_source = 0;
        assert!(validate_settings(&settings).is_err());
        settings = AppSettings::default();
        settings.health.interval_secs = 0;
        assert!(validate_settings(&settings).is_err());
        settings = AppSettings::default();
        settings.logs.ignored_paths = vec!["/*".into(), "/assets/*".into()];
        validate_settings(&settings).unwrap();
        for name in ["Host", "Invalid Header", ""] {
            let mut options = ProxyOptions::default();
            options
                .request_headers
                .insert(name.into(), Some("value".into()));
            assert!(validate_proxy(&options).is_err());
        }
        let mut options = ProxyOptions::default();
        options
            .request_headers
            .insert("X-Inject".into(), Some("a\r\nb".into()));
        assert!(validate_proxy(&options).is_err());
    }
    #[test]
    fn duplicate_custom_routes_are_rejected_but_nested_routes_are_specific_first() {
        let mut one =
            crate::caddy::generator::tests::project("one", false, "http://127.0.0.1:3000");
        let mut two =
            crate::caddy::generator::tests::project("two", false, "http://127.0.0.1:3001");
        one.route_prefix = Some("/api".into());
        two.route_prefix = Some("/api".into());
        let mut config = crate::model::Config {
            projects: std::collections::HashMap::from([("one".into(), one), ("two".into(), two)]),
            ..Default::default()
        };
        assert!(crate::validation::validate_config(&config).is_err());
        config.projects.get_mut("two").unwrap().route_prefix = Some("/api/v2".into());
        crate::validation::validate_config(&config).unwrap();
        let generated = crate::caddy::generate_caddy_config(&config);
        assert_eq!(
            generated["apps"]["http"]["servers"]["proxy_0"]["routes"][0]["match"][0]["path"][0],
            "/api/v2"
        );
    }
}
