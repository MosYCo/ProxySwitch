use crate::events;
use crate::model::{LogClearResult, LogEntry, LogLevel, LogSource};
use crate::preferences::LogSettings;
use chrono::Utc;
use serde_json::Value;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter};

pub struct Logger {
    entries: Mutex<LogBuffer>,
    log_dir: PathBuf,
    app_handle: Mutex<Option<AppHandle>>,
    settings: RwLock<LogSettings>,
    cleanup_date: Mutex<Option<chrono::NaiveDate>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(category: &str) -> LogEntry {
        LogEntry {
            id: 0,
            timestamp: Utc::now(),
            level: LogLevel::Info,
            category: category.into(),
            message: "entry".into(),
            data: None,
        }
    }

    #[test]
    fn busy_caddy_output_cannot_evict_software_events() {
        let mut buffer = LogBuffer::default();
        let runtime = buffer.push(entry("system"));
        for _ in 0..700 {
            buffer.push(entry("caddy"));
        }
        let recent = buffer.recent(1000);
        assert_eq!(recent.len(), ENTRIES_PER_SOURCE + 1);
        assert_eq!(recent[0].id, runtime.id);
        assert!(recent.windows(2).all(|pair| pair[0].id < pair[1].id));
        assert!(buffer.recent(0).is_empty());
    }

    #[test]
    fn clear_is_scoped_and_preserves_a_monotonic_cursor() {
        let mut buffer = LogBuffer::default();
        let first = buffer.push(entry("system"));
        let caddy = buffer.push(entry("caddy"));
        let cleared = buffer.clear(Some(LogSource::Runtime));
        assert_eq!(cleared.through_id, caddy.id);
        assert_eq!(buffer.recent(1000)[0].id, caddy.id);
        let next = buffer.push(entry("system"));
        assert!(next.id > cleared.through_id && next.id > first.id);
        buffer.clear(None);
        assert!(buffer.recent(1000).is_empty());
        assert!(buffer.push(entry("system")).id > next.id);
    }

    #[test]
    fn raw_caddy_fields_are_preserved_in_the_disk_log() {
        let directory = crate::test_support::Directory::new();
        let logger = Logger::new(directory.0.to_str().unwrap()).unwrap();
        let data = serde_json::json!({"logger": "http.log.error", "error": "dial tcp: connection refused"});
        logger.log_with_data(LogLevel::Error, "caddy", "proxy failed", Some(data.clone()));
        let entry = logger.get_recent(10).remove(0);
        let filename = directory
            .0
            .join(format!("{}.log", entry.timestamp.format("%Y-%m-%d")));
        let output = std::fs::read_to_string(filename).unwrap();
        assert!(output.contains(&data.to_string()));
        assert_eq!(entry.id, 1);
    }
    #[test]
    fn ignored_requests_are_dropped_and_sensitive_uris_are_sanitized_before_logging() {
        let directory = crate::test_support::Directory::new();
        let logger = Logger::new(directory.0.to_str().unwrap()).unwrap();
        let mut settings = LogSettings::default();
        settings.ignored_paths = vec!["/health".into(), "/assets/*".into()];
        settings.slow_request_ms = 100;
        logger.configure(settings.clone());
        let make = |uri: &str| serde_json::json!({"logger": "http.log.access", "request": {"uri": uri}, "cpt_original_uri": uri, "duration": 0.15});
        assert!(logger.prepare_caddy_log(make("/health?ok=1")).is_none());
        assert!(logger.prepare_caddy_log(make("/assets/a.js")).is_none());
        let value = logger
            .prepare_caddy_log(make(
                "/api?%74oken=secret&password=123&keep=a%20b&token=other",
            ))
            .unwrap();
        let serialized = value.to_string();
        assert!(
            !serialized.contains("secret")
                && !serialized.contains("123")
                && !serialized.contains("other")
        );
        assert!(serialized.contains("keep=a%20b"));
        assert_eq!(value["cpt_slow"], true);
        logger.log_with_data(
            LogLevel::Info,
            "caddy",
            value["request"]["uri"].as_str().unwrap(),
            Some(value.clone()),
        );
        let file = directory
            .0
            .join(format!("{}.log", Utc::now().format("%Y-%m-%d")));
        assert!(!std::fs::read_to_string(file).unwrap().contains("secret"));
        settings.requests_enabled = false;
        logger.configure(settings);
        assert!(logger.prepare_caddy_log(make("/api")).is_none());
        assert!(logger.prepare_caddy_log(serde_json::json!({"logger": "http.log.error", "request": {"uri": "/api?token=secret"}})).is_some());
    }
    #[test]
    fn retention_removes_only_expired_daily_logs_and_capacity_changes_apply_immediately() {
        let directory = crate::test_support::Directory::new();
        let logger = Logger::new(directory.0.to_str().unwrap()).unwrap();
        std::fs::write(directory.0.join("2000-01-01.log"), "old").unwrap();
        std::fs::write(directory.0.join("keep-me.log"), "unrelated").unwrap();
        let today = format!("{}.log", Utc::now().format("%Y-%m-%d"));
        std::fs::write(directory.0.join(&today), "today").unwrap();
        let mut settings = LogSettings::default();
        settings.entries_per_source = 100;
        settings.retention_days = 1;
        logger.configure(settings);
        assert!(!directory.0.join("2000-01-01.log").exists());
        assert!(directory.0.join("keep-me.log").exists() && directory.0.join(today).exists());
        for _ in 0..120 {
            logger.debug("system", "event");
        }
        assert_eq!(logger.get_recent(1000).len(), 100);
    }
    #[test]
    fn capacity_changes_keep_history_but_new_privacy_rules_invalidate_cached_requests() {
        let directory = crate::test_support::Directory::new();
        let logger = Logger::new(directory.0.to_str().unwrap()).unwrap();
        let value = serde_json::json!({"logger": "http.log.access", "request": {"uri": "/api?credential=private"}});
        logger.log_caddy(LogLevel::Info, value.clone(), |value| {
            value["request"]["uri"].as_str().unwrap().to_string()
        });
        let mut settings = LogSettings::default();
        settings.entries_per_source = 1000;
        logger.configure(settings.clone());
        assert_eq!(logger.get_recent(10).len(), 1);
        settings.redacted_query_params.push("credential".into());
        logger.configure(settings);
        assert!(logger.get_recent(10).is_empty());
        logger.log_caddy(LogLevel::Info, value, |value| {
            value["request"]["uri"].as_str().unwrap().to_string()
        });
        let entry = &logger.get_recent(10)[0];
        assert!(!entry.message.contains("private"));
        assert!(!entry.data.as_ref().unwrap().to_string().contains("private"));
    }
}

const ENTRIES_PER_SOURCE: usize = 500;

struct LogBuffer {
    runtime: VecDeque<LogEntry>,
    caddy: VecDeque<LogEntry>,
    last_id: u64,
    limit: usize,
}
impl Default for LogBuffer {
    fn default() -> Self {
        Self {
            runtime: VecDeque::new(),
            caddy: VecDeque::new(),
            last_id: 0,
            limit: ENTRIES_PER_SOURCE,
        }
    }
}

impl LogBuffer {
    fn push(&mut self, mut entry: LogEntry) -> LogEntry {
        self.last_id += 1;
        entry.id = self.last_id;
        let stream = if entry.category == "caddy" {
            &mut self.caddy
        } else {
            &mut self.runtime
        };
        stream.push_back(entry.clone());
        if stream.len() > self.limit {
            stream.pop_front();
        }
        entry
    }

    fn recent(&self, limit: usize) -> Vec<LogEntry> {
        let mut entries: Vec<_> = self.runtime.iter().chain(&self.caddy).cloned().collect();
        entries.sort_by_key(|entry| entry.id);
        entries.drain(..entries.len().saturating_sub(limit));
        entries
    }

    fn clear(&mut self, source: Option<LogSource>) -> LogClearResult {
        if source != Some(LogSource::Caddy) {
            self.runtime.clear();
        }
        if source != Some(LogSource::Runtime) {
            self.caddy.clear();
        }
        LogClearResult {
            source,
            through_id: self.last_id,
        }
    }
}

impl Logger {
    pub fn new(log_dir: &str) -> anyhow::Result<Self> {
        let log_dir = PathBuf::from(log_dir);
        std::fs::create_dir_all(&log_dir)?;

        Ok(Self {
            entries: Mutex::new(LogBuffer::default()),
            log_dir,
            app_handle: Mutex::new(None),
            settings: RwLock::new(LogSettings::default()),
            cleanup_date: Mutex::new(None),
        })
    }
    pub fn configure(&self, settings: LogSettings) {
        let changed =
            self.settings.read().unwrap().redacted_query_params != settings.redacted_query_params;
        let limit = settings.entries_per_source;
        *self.settings.write().unwrap() = settings;
        let mut buffer = self.entries.lock().unwrap();
        buffer.limit = limit;
        while buffer.runtime.len() > limit {
            buffer.runtime.pop_front();
        }
        while buffer.caddy.len() > limit {
            buffer.caddy.pop_front();
        }
        // Previously cached request URIs may contain parameters that are now
        // redacted. Invalidate this source, including delayed frontend batches.
        let cleared = changed.then(|| buffer.clear(Some(LogSource::Caddy)));
        drop(buffer);
        if let (Some(cleared), Some(app)) = (cleared, self.app_handle.lock().unwrap().clone()) {
            app.emit(events::LOGS_CLEARED, cleared).ok();
        }
        *self.cleanup_date.lock().unwrap() = None;
        self.cleanup_old_files();
    }
    pub fn capacity(&self) -> usize {
        self.settings.read().unwrap().entries_per_source * 2
    }

    pub fn prepare_caddy_log(&self, mut value: Value) -> Option<Value> {
        let settings = self.settings.read().unwrap();
        let access = value["logger"]
            .as_str()
            .is_some_and(|v| v.starts_with("http.log.access"));
        if access {
            if !settings.requests_enabled {
                return None;
            }
            let uri = value["cpt_original_uri"]
                .as_str()
                .or_else(|| value["request"]["uri"].as_str())
                .unwrap_or("/");
            let path = uri.split('?').next().unwrap_or(uri);
            if settings.ignored_paths.iter().any(|pattern| {
                pattern
                    .strip_suffix("/*")
                    .map_or(path == pattern, |prefix| {
                        path == prefix || path.starts_with(&format!("{}/", prefix))
                    })
            }) {
                return None;
            }
            let slow = value["duration"]
                .as_f64()
                .is_some_and(|v| v * 1000.0 >= settings.slow_request_ms as f64);
            value["cpt_slow"] = Value::Bool(slow);
        }
        for pointer in ["/cpt_original_uri", "/request/uri", "/uri"] {
            if let Some(uri) = value.pointer_mut(pointer) {
                if let Some(text) = uri.as_str() {
                    *uri = Value::String(redact_uri(text, &settings.redacted_query_params));
                }
            }
        }
        for pointer in ["/request/headers/Referer", "/resp_headers/Location"] {
            if let Some(values) = value.pointer_mut(pointer).and_then(Value::as_array_mut) {
                for value in values {
                    if let Some(text) = value.as_str() {
                        *value = Value::String(redact_uri(text, &settings.redacted_query_params));
                    }
                }
            }
        }
        Some(value)
    }
    fn cleanup_old_files(&self) {
        let today = Utc::now().date_naive();
        let mut date = self.cleanup_date.lock().unwrap();
        if *date == Some(today) {
            return;
        }
        *date = Some(today);
        let retention = self.settings.read().unwrap().retention_days;
        if retention == 0 {
            return;
        }
        let cutoff = today - chrono::Duration::days(i64::from(retention.saturating_sub(1)));
        if let Ok(entries) = std::fs::read_dir(&self.log_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Some(day) = name
                    .strip_suffix(".log")
                    .and_then(|name| chrono::NaiveDate::parse_from_str(name, "%Y-%m-%d").ok())
                {
                    if day < cutoff && entry.file_type().is_ok_and(|kind| kind.is_file()) {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    pub fn set_app_handle(&self, app_handle: AppHandle) {
        let mut current = self.app_handle.lock().unwrap();
        *current = Some(app_handle);
    }

    pub fn log(&self, level: LogLevel, category: &str, message: &str) {
        self.log_with_data(level, category, message, None);
    }

    pub fn log_caddy(&self, level: LogLevel, value: Value, format: impl FnOnce(&Value) -> String) {
        // Serialize sanitization, formatting and insertion with cache clearing.
        // A record prepared under an old privacy rule cannot arrive after the
        // new rule's clear cursor with an unsanitized summary.
        let mut entries = self.entries.lock().unwrap();
        let Some(value) = self.prepare_caddy_log(value) else {
            return;
        };
        let message = format(&value);
        let entry = entries.push(LogEntry {
            id: 0,
            timestamp: Utc::now(),
            level,
            category: "caddy".into(),
            message,
            data: Some(value),
        });
        self.write_to_file(&entry);
        drop(entries);
        if let Some(app) = self.app_handle.lock().unwrap().clone() {
            app.emit(events::LOG_CREATED, &entry).ok();
        }
    }

    pub fn log_with_data(
        &self,
        level: LogLevel,
        category: &str,
        message: &str,
        data: Option<Value>,
    ) {
        let mut entries = self.entries.lock().unwrap();
        let entry = entries.push(LogEntry {
            id: 0,
            timestamp: Utc::now(),
            level,
            category: category.to_string(),
            message: message.to_string(),
            data,
        });

        // Write to file
        self.write_to_file(&entry);

        drop(entries);

        if let Some(app) = self.app_handle.lock().unwrap().clone() {
            app.emit(events::LOG_CREATED, &entry).ok();
        }
    }

    pub fn debug(&self, category: &str, message: &str) {
        self.log(LogLevel::Debug, category, message);
    }

    pub fn info(&self, category: &str, message: &str) {
        self.log(LogLevel::Info, category, message);
        tracing::info!("[{}] {}", category, message);
    }

    pub fn warn(&self, category: &str, message: &str) {
        self.log(LogLevel::Warn, category, message);
        tracing::warn!("[{}] {}", category, message);
    }

    pub fn error(&self, category: &str, message: &str) {
        self.log(LogLevel::Error, category, message);
        tracing::error!("[{}] {}", category, message);
    }

    pub fn get_recent(&self, limit: usize) -> Vec<LogEntry> {
        self.entries.lock().unwrap().recent(limit)
    }

    pub fn get_by_level(&self, level: &str) -> Vec<LogEntry> {
        self.get_recent(self.capacity())
            .into_iter()
            .filter(|e| e.level.to_string() == level)
            .collect()
    }

    pub fn get_by_category(&self, category: &str) -> Vec<LogEntry> {
        self.get_recent(self.capacity())
            .into_iter()
            .filter(|e| e.category == category)
            .collect()
    }

    pub fn clear(&self, source: Option<LogSource>) -> LogClearResult {
        self.entries.lock().unwrap().clear(source)
    }

    fn write_to_file(&self, entry: &LogEntry) {
        self.cleanup_old_files();
        let date = entry.timestamp.format("%Y-%m-%d").to_string();
        let file_path = self.log_dir.join(format!("{}.log", date));
        let details = entry
            .data
            .as_ref()
            .map(|data| format!(" | {}", data))
            .unwrap_or_default();
        let line = format!(
            "{} [{}] [{}] {}{}\n",
            entry.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
            entry.level,
            entry.category,
            entry.message,
            details
        );

        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)
        {
            file.write_all(line.as_bytes()).ok();
        }
    }
}

fn redact_uri(uri: &str, keys: &[String]) -> String {
    let Some((path, query)) = uri.split_once('?') else {
        return uri.into();
    };
    let query = query
        .split('&')
        .map(|pair| {
            let name = pair.split('=').next().unwrap_or(pair);
            let decoded = url::form_urlencoded::parse(format!("{}=", name).as_bytes())
                .next()
                .map(|(key, _)| key.into_owned())
                .unwrap_or_default();
            if keys.iter().any(|key| key.eq_ignore_ascii_case(&decoded)) {
                format!("{}=[REDACTED]", name)
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&");
    format!("{}?{}", path, query)
}
