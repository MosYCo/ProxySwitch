use crate::model::{LogEntry, LogLevel};
use chrono::Utc;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct Logger {
    entries: Mutex<Vec<LogEntry>>,
    log_dir: PathBuf,
    app_handle: Mutex<Option<AppHandle>>,
}

impl Logger {
    pub fn new(log_dir: &str) -> anyhow::Result<Self> {
        let log_dir = PathBuf::from(log_dir);
        std::fs::create_dir_all(&log_dir)?;

        Ok(Self {
            entries: Mutex::new(Vec::new()),
            log_dir,
            app_handle: Mutex::new(None),
        })
    }

    pub fn set_app_handle(&self, app_handle: AppHandle) {
        let mut current = self.app_handle.lock().unwrap();
        *current = Some(app_handle);
    }

    pub fn log(&self, level: LogLevel, category: &str, message: &str) {
        self.log_with_data(level, category, message, None);
    }

    pub fn log_with_data(
        &self,
        level: LogLevel,
        category: &str,
        message: &str,
        data: Option<Value>,
    ) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level,
            category: category.to_string(),
            message: message.to_string(),
            data,
        };

        // Write to file
        self.write_to_file(&entry);

        // Store in memory
        let mut entries = self.entries.lock().unwrap();
        entries.push(entry.clone());

        // Keep only last 1000 entries in memory
        let overflow = entries.len().saturating_sub(1000);
        if overflow > 0 {
            entries.drain(0..overflow);
        }
        drop(entries);

        if let Some(app) = self.app_handle.lock().unwrap().clone() {
            app.emit("log.created", &entry).ok();
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
        let entries = self.entries.lock().unwrap();
        let start = if entries.len() > limit {
            entries.len() - limit
        } else {
            0
        };
        entries[start..].to_vec()
    }

    pub fn get_by_level(&self, level: &str) -> Vec<LogEntry> {
        let entries = self.entries.lock().unwrap();
        entries
            .iter()
            .filter(|e| e.level.to_string() == level)
            .cloned()
            .collect()
    }

    pub fn get_by_category(&self, category: &str) -> Vec<LogEntry> {
        let entries = self.entries.lock().unwrap();
        entries
            .iter()
            .filter(|e| e.category == category)
            .cloned()
            .collect()
    }

    pub fn clear(&self) {
        let mut entries = self.entries.lock().unwrap();
        entries.clear();
    }

    fn write_to_file(&self, entry: &LogEntry) {
        let date = entry.timestamp.format("%Y-%m-%d").to_string();
        let file_path = self.log_dir.join(format!("{}.log", date));
        let line = format!(
            "{} [{}] [{}] {}\n",
            entry.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
            entry.level,
            entry.category,
            entry.message
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
