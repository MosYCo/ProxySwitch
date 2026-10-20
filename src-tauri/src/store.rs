use crate::model::{Config, Environment, Project};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub struct Store {
    file_path: PathBuf,
    config: Config,
}

impl Store {
    pub fn new(path: &str) -> Result<Self> {
        let file_path = PathBuf::from(path);
        let config = if file_path.exists() {
            let data = fs::read_to_string(&file_path)
                .with_context(|| format!("reading config from {}", file_path.display()))?;
            parse_config(&data)?
        } else {
            Config::default()
        };
        Ok(Self { file_path, config })
    }

    pub fn replace_config(&mut self, config: Config) -> Result<()> {
        let dir = self.file_path.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(dir)?;
        if self.file_path.is_file() && config.settings.backup.enabled {
            self.create_backup(config.settings.backup.max_backups)?;
        }
        let tmp_path = dir.join(format!(".config-{}.json.tmp", uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp_path)?;
            file.write_all(serde_json::to_string_pretty(&config)?.as_bytes())?;
            file.sync_all()?;
            drop(file);
            fs::rename(&tmp_path, &self.file_path).context("replacing config file")?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&tmp_path);
        }
        result?;
        self.config = config;
        Ok(())
    }

    pub fn get_config(&self) -> &Config {
        &self.config
    }
    pub fn backup_dir(&self) -> PathBuf {
        self.file_path
            .parent()
            .unwrap_or(Path::new("."))
            .join("backups")
    }
    pub fn create_backup(&self, keep: usize) -> Result<String> {
        let dir = self.backup_dir();
        fs::create_dir_all(&dir)?;
        let id = format!(
            "backup-{}-{}.json",
            chrono::Utc::now().format("%Y%m%d-%H%M%S%9f"),
            uuid::Uuid::new_v4()
        );
        let path = dir.join(&id);
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        file.write_all(serde_json::to_string_pretty(&self.config)?.as_bytes())?;
        file.sync_all()?;
        self.prune_backups(keep)?;
        Ok(id)
    }
    pub fn backup_ids(&self) -> Result<Vec<String>> {
        let dir = self.backup_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut ids = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.file_type()?.is_file()
                && name.starts_with("backup-")
                && name.ends_with(".json")
            {
                ids.push(name);
            }
        }
        ids.sort_by(|a, b| b.cmp(a));
        Ok(ids)
    }
    pub fn prune_backups(&self, keep: usize) -> Result<()> {
        for id in self.backup_ids()?.into_iter().skip(keep.max(1)) {
            fs::remove_file(self.backup_dir().join(id))?;
        }
        Ok(())
    }
    pub fn read_backup(&self, id: &str) -> Result<Config> {
        if id.contains(['/', '\\']) || !self.backup_ids()?.iter().any(|name| name == id) {
            anyhow::bail!("备份不存在");
        }
        parse_config(&fs::read_to_string(self.backup_dir().join(id))?)
    }
    pub fn get_project(&self, name: &str) -> Option<&Project> {
        self.config.projects.get(name)
    }
    pub fn get_environment(&self, project: &str, name: &str) -> Option<&Environment> {
        self.get_project(project)
            .and_then(|p| p.environments.get(name))
    }
}

// Preserve the routes of old shared-port configurations when making routing explicit.
pub(crate) fn parse_config(data: &str) -> Result<Config> {
    let mut value: serde_json::Value = serde_json::from_str(data).context("parsing config JSON")?;
    if let Some(projects) = value
        .get_mut("projects")
        .and_then(serde_json::Value::as_object_mut)
    {
        let mut counts = HashMap::<u16, usize>::new();
        for project in projects.values() {
            if project.get("enabled").and_then(|value| value.as_bool()) == Some(false) {
                continue;
            }
            if let Some(port) = project
                .get("listen")
                .and_then(|v| v.as_str())
                .and_then(|s| s.strip_prefix(':'))
                .and_then(|p| p.parse::<u16>().ok())
            {
                *counts.entry(port).or_default() += 1;
            }
        }
        for project in projects.values_mut().filter_map(|v| v.as_object_mut()) {
            let shared = project
                .get("listen")
                .and_then(|v| v.as_str())
                .and_then(|s| s.strip_prefix(':'))
                .and_then(|p| p.parse::<u16>().ok())
                .is_some_and(|p| counts.get(&p).copied().unwrap_or(0) > 1);
            project
                .entry("path_prefix")
                .or_insert(serde_json::Value::Bool(shared));
        }
    }
    let mut config: Config =
        serde_json::from_value(value).context("parsing project configuration")?;
    for project in config.projects.values_mut() {
        if let Some(port) = project
            .listen
            .strip_prefix(':')
            .and_then(|p| p.parse::<u16>().ok())
        {
            project.listen = format!(":{}", port);
        }
    }
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_shared_routes_stay_explicit_after_a_project_is_removed() {
        let mut config = parse_config(r#"{"projects":{"one":{"name":"one","listen":":8080"},"two":{"name":"two","listen":":08080"}}}"#).unwrap();
        assert!(config.projects["one"].path_prefix);
        assert!(config.projects["one"].enabled);
        assert!(!config.projects["one"].strip_prefix);
        config.projects.remove("two");
        let reloaded = parse_config(&serde_json::to_string(&config).unwrap()).unwrap();
        assert!(reloaded.projects["one"].path_prefix);
        let single =
            parse_config(r#"{"projects":{"one":{"name":"one","listen":":8080"}}}"#).unwrap();
        assert!(!single.projects["one"].path_prefix);
    }

    #[test]
    fn disabled_projects_stay_disabled_and_do_not_change_legacy_routing() {
        let config = parse_config(r#"{"projects":{"one":{"name":"one","listen":":8080"},"paused":{"name":"paused","listen":":8080","enabled":false}}}"#).unwrap();
        assert!(config.projects["one"].enabled);
        assert!(!config.projects["one"].path_prefix);
        assert!(!config.projects["paused"].enabled);
        let reloaded = parse_config(&serde_json::to_string(&config).unwrap()).unwrap();
        assert!(!reloaded.projects["paused"].enabled);
    }
    #[test]
    fn backups_capture_previous_configuration_and_enforce_retention_and_safe_ids() {
        let directory = crate::test_support::Directory::new();
        let file = directory.0.join("config.json");
        let mut store = Store::new(file.to_str().unwrap()).unwrap();
        let mut config = Config::default();
        config.settings.backup.max_backups = 2;
        store.replace_config(config.clone()).unwrap();
        for index in 0..4 {
            config.settings.health.interval_secs = 30 + index;
            store.replace_config(config.clone()).unwrap();
        }
        let ids = store.backup_ids().unwrap();
        assert_eq!(ids.len(), 2);
        let intervals: std::collections::HashSet<_> = ids
            .iter()
            .map(|id| store.read_backup(id).unwrap().settings.health.interval_secs)
            .collect();
        assert!(intervals.contains(&32));
        assert!(store.read_backup("../config.json").is_err());
        let old = store.get_config().clone();
        let mut disabled = old.clone();
        disabled.settings.backup.enabled = false;
        store.replace_config(disabled).unwrap();
        assert_eq!(store.backup_ids().unwrap().len(), 2);
    }
}
