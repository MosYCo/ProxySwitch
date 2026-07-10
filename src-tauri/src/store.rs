use crate::model::{Config, Environment, Project};
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Store {
    file_path: PathBuf,
    config: Config,
}

impl Store {
    pub fn new(path: &str) -> Result<Self> {
        let file_path = PathBuf::from(path);
        let mut store = Self {
            file_path,
            config: Config::default(),
        };

        if store.file_path.exists() {
            store.load()?;
        }

        Ok(store)
    }

    fn load(&mut self) -> Result<()> {
        let data = fs::read_to_string(&self.file_path)
            .with_context(|| format!("reading config from {}", self.file_path.display()))?;
        self.config = serde_json::from_str(&data).with_context(|| "parsing config JSON")?;
        Ok(())
    }

    fn save(&self) -> Result<()> {
        let data = serde_json::to_string_pretty(&self.config)?;
        let dir = self.file_path.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(dir)?;

        let tmp_name = dir.join(format!(".config-{}.json.tmp", uuid::Uuid::new_v4()));
        fs::write(&tmp_name, &data)?;
        fs::rename(&tmp_name, &self.file_path).or_else(|_| {
            // Fallback: direct write if rename fails (cross-filesystem)
            fs::write(&self.file_path, &data)?;
            fs::remove_file(&tmp_name).ok();
            Ok::<(), anyhow::Error>(())
        })?;
        Ok(())
    }

    pub fn get_config(&self) -> &Config {
        &self.config
    }

    pub fn get_project(&self, name: &str) -> Option<&Project> {
        self.config.projects.get(name)
    }

    pub fn set_project(&mut self, project: Project) -> Result<()> {
        self.config.projects.insert(project.name.clone(), project);
        self.save()
    }

    pub fn delete_project(&mut self, name: &str) -> Result<()> {
        self.config.projects.remove(name);
        self.save()
    }

    pub fn get_environment(&self, project_name: &str, env_name: &str) -> Option<&Environment> {
        self.config
            .projects
            .get(project_name)
            .and_then(|p| p.environments.get(env_name))
    }

    pub fn set_environment(
        &mut self,
        project_name: &str,
        env_name: &str,
        env: Environment,
    ) -> Result<()> {
        let project = self
            .config
            .projects
            .get_mut(project_name)
            .context("project not found")?;

        project.environments.insert(env_name.to_string(), env);

        if project.current.is_empty() {
            project.current = env_name.to_string();
        }

        self.save()
    }

    pub fn delete_environment(&mut self, project_name: &str, env_name: &str) -> Result<()> {
        let project = self
            .config
            .projects
            .get_mut(project_name)
            .context("project not found")?;

        if project.current == env_name {
            anyhow::bail!("cannot delete current environment {:?}", env_name);
        }

        project.environments.remove(env_name);
        self.save()
    }

    pub fn set_current_environment(&mut self, project_name: &str, env_name: &str) -> Result<()> {
        let project = self
            .config
            .projects
            .get_mut(project_name)
            .context("project not found")?;

        if !project.environments.contains_key(env_name) {
            anyhow::bail!("environment {:?} not found", env_name);
        }

        project.current = env_name.to_string();
        self.save()
    }

    pub fn build_with_current(&self, project_name: &str, env_name: &str) -> Result<Config> {
        let project = self
            .config
            .projects
            .get(project_name)
            .context("project not found")?;

        if !project.environments.contains_key(env_name) {
            anyhow::bail!("environment {:?} not found", env_name);
        }

        let mut config = self.config.clone();
        config.projects.get_mut(project_name).unwrap().current = env_name.to_string();

        Ok(config)
    }
}
