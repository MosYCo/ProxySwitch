use crate::caddy::Client;
use crate::model::{Config, Environment, Project};
use crate::store::Store;
use crate::validation;
use anyhow::{bail, Context, Result};

pub enum Change {
    CreateProject(Project),
    UpdateProject(String, Project),
    SetProjectEnabled(String, bool),
    DeleteProject(String),
    CreateEnvironment(String, String, Environment),
    UpdateEnvironment(String, String, Environment),
    DeleteEnvironment(String, String),
    SwitchEnvironment(String, String),
    SetAdmin(String),
    Settings(String, crate::model::AppSettings),
    Replace(Config),
    ImportProjects(std::collections::HashMap<String, Project>, bool),
}

impl Change {
    pub fn prepare(self, current: &Config) -> Result<Config> {
        let mut next = current.clone();
        match self {
            Self::CreateProject(project) => {
                if next.projects.contains_key(&project.name) {
                    bail!("项目「{}」已存在，请使用其他名称", project.name);
                }
                next.projects.insert(project.name.clone(), project);
            }
            Self::UpdateProject(name, update) => {
                let project = next.projects.get_mut(&name).context("项目不存在")?;
                // An old edit dialog must not overwrite newer environment changes.
                project.listen = update.listen;
                project.desc = update.desc;
                project.path_prefix = update.path_prefix;
                project.strip_prefix = update.strip_prefix;
                project.route_prefix = update.route_prefix;
                project.rewrite_prefix = update.rewrite_prefix;
                project.proxy = update.proxy;
                project.health = update.health;
            }
            Self::DeleteProject(name) => {
                next.projects.remove(&name).context("项目不存在")?;
            }
            Self::SetProjectEnabled(name, enabled) => {
                next.projects.get_mut(&name).context("项目不存在")?.enabled = enabled;
            }
            Self::CreateEnvironment(project, name, env) => {
                let project = next.projects.get_mut(&project).context("项目不存在")?;
                if project.environments.contains_key(&name) {
                    bail!("环境「{}」已存在，请使用其他名称", name);
                }
                if project.current.is_empty() {
                    project.current = name.clone();
                }
                project.environments.insert(name, env);
            }
            Self::UpdateEnvironment(project, name, env) => {
                let project = next.projects.get_mut(&project).context("项目不存在")?;
                *project.environments.get_mut(&name).context("环境不存在")? = env;
            }
            Self::DeleteEnvironment(project, name) => {
                let project = next.projects.get_mut(&project).context("项目不存在")?;
                if project.current == name {
                    bail!("不能删除当前使用的环境，请先切换到其他环境");
                }
                project.environments.remove(&name).context("环境不存在")?;
            }
            Self::SwitchEnvironment(project, name) => {
                let project = next.projects.get_mut(&project).context("项目不存在")?;
                if !project.environments.contains_key(&name) {
                    bail!("环境不存在");
                }
                project.current = name;
            }
            Self::SetAdmin(admin) => next.caddy_admin = admin,
            Self::Settings(admin, settings) => {
                next.caddy_admin = admin;
                next.settings = settings;
            }
            Self::Replace(config) => next = config,
            Self::ImportProjects(projects, replace_all) => {
                if replace_all {
                    next.projects.clear();
                }
                next.projects.extend(projects);
            }
        }
        for project in next.projects.values_mut() {
            validation::validate_project(project)?;
            project.listen = format!(
                ":{}",
                project
                    .listen
                    .trim()
                    .strip_prefix(':')
                    .unwrap()
                    .parse::<u16>()?
            );
        }
        validation::validate_config(&next)?;
        Ok(next)
    }
}

pub async fn set_project_enabled(
    store: &mut Store,
    client: &Client,
    name: &str,
    enabled: bool,
    engine_running: bool,
) -> Result<(Config, bool)> {
    let next = Change::SetProjectEnabled(name.into(), enabled).prepare(store.get_config())?;
    if !engine_running && client.health_check().await.is_err() {
        // Save the desired startup selection while the engine is stopped. A live
        // managed child must always confirm its runtime change before saving.
        store.replace_config(next.clone())?;
        Ok((next, false))
    } else {
        let next = commit_change(
            store,
            client,
            Change::SetProjectEnabled(name.into(), enabled),
        )
        .await?;
        Ok((next, true))
    }
}

pub async fn commit_change(store: &mut Store, client: &Client, change: Change) -> Result<Config> {
    let next = change.prepare(store.get_config())?;
    let previous_admin = client.admin_url();
    let runtime = client
        .get_config()
        .await
        .context("无法读取 Caddy 状态，配置未保存；请确认服务已启动")?;
    if let Err(apply_error) = client.load_config(&next).await {
        // A lost/error response need not mean that the server did not apply it.
        // Only inspect/restore the explicitly selected instance, never a default address.
        match client.get_config().await {
            Ok(actual) if actual == runtime => {
                bail!("Caddy 拒绝配置，原配置未保存：{}", apply_error);
            }
            Ok(_) => match client.load_json_config(&runtime).await {
                Ok(()) => bail!(
                    "Caddy 提交失败，运行配置已恢复，原配置未保存：{}",
                    apply_error
                ),
                Err(rollback_error) => bail!(
                    "Caddy 提交失败且回滚失败，本地配置未保存，运行状态待确认：{}；{}",
                    apply_error,
                    rollback_error
                ),
            },
            Err(check_error) => bail!(
                "Caddy 提交结果无法确认，本地配置未保存，请检查服务或重载原配置：{}；{}",
                apply_error,
                check_error
            ),
        }
    }
    client.set_admin_url(&next.caddy_admin);
    if let Err(save_error) = store.replace_config(next.clone()) {
        match client.load_json_config(&runtime).await {
            Ok(()) => {
                client.set_admin_url(&previous_admin);
                bail!("保存失败，Caddy 已恢复原配置：{}", save_error);
            }
            Err(rollback_error) => bail!(
                "保存失败且 Caddy 回滚失败，请重载原配置。保存错误：{}；回滚错误：{}",
                save_error,
                rollback_error
            ),
        }
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::caddy::generator::tests::project;
    use crate::test_support::server;
    use serde_json::json;
    struct File(
        std::path::PathBuf,
        #[allow(dead_code)] crate::test_support::Directory,
    );
    impl Drop for File {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
            if self.0.is_dir() {
                let _ = std::fs::remove_dir(&self.0);
            }
        }
    }
    fn store() -> (Store, File) {
        let directory = crate::test_support::Directory::new();
        let file = File(directory.0.join("config.json"), directory);
        (Store::new(file.0.to_str().unwrap()).unwrap(), file)
    }
    fn config() -> Config {
        let p = project("demo", false, "http://127.0.0.1:3000");
        Config {
            projects: std::collections::HashMap::from([("demo".into(), p)]),
            ..Config::default()
        }
    }
    #[test]
    fn duplicate_creates_and_missing_updates_are_rejected() {
        let config = config();
        assert!(Change::CreateProject(config.projects["demo"].clone())
            .prepare(&config)
            .is_err());
        let env = config.projects["demo"].environments["dev"].clone();
        assert!(
            Change::CreateEnvironment("demo".into(), "dev".into(), env.clone())
                .prepare(&config)
                .is_err()
        );
        assert!(
            Change::UpdateEnvironment("demo".into(), "missing".into(), env)
                .prepare(&config)
                .is_err()
        );
        assert_eq!(config.projects["demo"].environments.len(), 1);
    }
    #[test]
    fn project_import_preserves_local_preferences_and_rejects_conflicts_atomically() {
        let mut current = config();
        current.settings.logs.entries_per_source = 2000;
        current.caddy_admin = "localhost:22222".into();
        let imported = std::collections::HashMap::from([(
            "two".into(),
            project("two", false, "http://127.0.0.1:3001"),
        )]);
        assert!(Change::ImportProjects(imported.clone(), false)
            .prepare(&current)
            .is_err());
        assert_eq!(current.projects.len(), 1);
        let next = Change::ImportProjects(imported, true)
            .prepare(&current)
            .unwrap();
        assert_eq!(next.projects.len(), 1);
        assert!(next.projects.contains_key("two"));
        assert_eq!(next.settings.logs.entries_per_source, 2000);
        assert_eq!(next.caddy_admin, "localhost:22222");
    }
    #[tokio::test]
    async fn rejected_settings_change_keeps_disk_memory_and_runtime_settings() {
        let endpoint = server(|request| {
            if request.method == "GET" {
                (200, json!({"unchanged": true}))
            } else {
                (400, json!({"error":"rejected"}))
            }
        })
        .await;
        let (mut store, file) = store();
        let mut initial = config();
        initial.caddy_admin = endpoint.address.clone();
        store.replace_config(initial.clone()).unwrap();
        let disk = std::fs::read(&file.0).unwrap();
        let mut settings = initial.settings.clone();
        settings.logs.caddy_level = "ERROR".into();
        assert!(commit_change(
            &mut store,
            &Client::new(&endpoint.address),
            Change::Settings(endpoint.address.clone(), settings)
        )
        .await
        .is_err());
        assert_eq!(store.get_config().settings, initial.settings);
        assert_eq!(std::fs::read(&file.0).unwrap(), disk);
    }
    #[test]
    fn shared_ports_require_explicit_prefixes_including_equivalent_port_strings() {
        let config = config();
        let mut second = project("second", true, "http://127.0.0.1:3001");
        second.listen = ":08080".into();
        assert!(Change::CreateProject(second.clone())
            .prepare(&config)
            .is_err());
        let mut prefixed = config.clone();
        prefixed.projects.get_mut("demo").unwrap().path_prefix = true;
        let shared = Change::CreateProject(second).prepare(&prefixed).unwrap();
        assert_eq!(shared.projects["second"].listen, ":8080");
        let remaining = Change::DeleteProject("second".into())
            .prepare(&shared)
            .unwrap();
        assert!(remaining.projects["demo"].path_prefix);
    }
    #[test]
    fn stale_project_edit_preserves_newer_environments_and_current_selection() {
        let mut current = config();
        let update = current.projects["demo"].clone();
        let p = current.projects.get_mut("demo").unwrap();
        p.environments
            .insert("prod".into(), p.environments["dev"].clone());
        p.current = "prod".into();
        p.enabled = false;
        let next = Change::UpdateProject("demo".into(), update)
            .prepare(&current)
            .unwrap();
        assert_eq!(next.projects["demo"].current, "prod");
        assert!(next.projects["demo"].environments.contains_key("prod"));
        assert!(!next.projects["demo"].enabled);
    }

    #[test]
    fn inactive_projects_do_not_reserve_ports_and_conflicting_activation_is_rejected() {
        let initial = config();
        let mut second = project("second", false, "http://127.0.0.1:3001");
        second.enabled = false;
        let next = Change::CreateProject(second).prepare(&initial).unwrap();
        assert!(Change::SetProjectEnabled("second".into(), true)
            .prepare(&next)
            .is_err());
        let stopped = Change::SetProjectEnabled("demo".into(), false)
            .prepare(&next)
            .unwrap();
        let switched = Change::SetProjectEnabled("second".into(), true)
            .prepare(&stopped)
            .unwrap();
        assert!(!switched.projects["demo"].enabled);
        assert!(switched.projects["second"].enabled);
        assert!(Change::SetProjectEnabled("missing".into(), true)
            .prepare(&switched)
            .is_err());
        let mut empty = project("empty", false, "http://127.0.0.1:3002");
        empty.environments.clear();
        empty.current.clear();
        assert!(Change::CreateProject(empty).prepare(&initial).is_ok());
    }

    #[tokio::test]
    async fn project_toggle_is_persisted_without_losing_environment_selection() {
        let endpoint = server(|_| (200, json!({}))).await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut initial = config();
        initial.caddy_admin = endpoint.address.clone();
        let p = initial.projects.get_mut("demo").unwrap();
        p.environments
            .insert("prod".into(), p.environments["dev"].clone());
        p.current = "prod".into();
        store.replace_config(initial).unwrap();
        let (_, applied) = set_project_enabled(&mut store, &client, "demo", false, true)
            .await
            .unwrap();
        assert!(applied);
        let reopened = Store::new(file.0.to_str().unwrap()).unwrap();
        let p = reopened.get_project("demo").unwrap();
        assert!(!p.enabled);
        assert_eq!(p.current, "prod");
        assert_eq!(p.environments.len(), 2);
        assert_eq!(
            endpoint.requests.lock().unwrap()[1].body["apps"]["http"]["servers"],
            json!({})
        );
        set_project_enabled(&mut store, &client, "demo", true, true)
            .await
            .unwrap();
        assert!(store.get_project("demo").unwrap().has_proxy_route());
        assert_eq!(store.get_project("demo").unwrap().current, "prod");
    }

    #[tokio::test]
    async fn rejected_project_activation_preserves_memory_and_disk() {
        let endpoint = server(|request| {
            if request.method == "GET" {
                (200, json!({"original": true}))
            } else {
                (400, json!({"error": "port occupied"}))
            }
        })
        .await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut initial = config();
        initial.caddy_admin = endpoint.address.clone();
        initial.projects.get_mut("demo").unwrap().enabled = false;
        store.replace_config(initial).unwrap();
        let before = std::fs::read(&file.0).unwrap();
        assert!(set_project_enabled(&mut store, &client, "demo", true, true)
            .await
            .is_err());
        assert!(!store.get_project("demo").unwrap().enabled);
        assert_eq!(std::fs::read(&file.0).unwrap(), before);
    }

    #[tokio::test]
    async fn stopped_engine_can_save_startup_selection_but_a_live_child_cannot_skip_reload() {
        let endpoint = server(|_| (503, json!({"error": "admin unavailable"}))).await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut initial = config();
        initial.caddy_admin = endpoint.address.clone();
        store.replace_config(initial).unwrap();
        assert!(
            set_project_enabled(&mut store, &client, "demo", false, true)
                .await
                .is_err()
        );
        assert!(store.get_project("demo").unwrap().enabled);
        let (_, applied) = set_project_enabled(&mut store, &client, "demo", false, false)
            .await
            .unwrap();
        assert!(!applied);
        let reopened = Store::new(file.0.to_str().unwrap()).unwrap();
        assert!(!reopened.get_project("demo").unwrap().enabled);
        assert!(endpoint
            .requests
            .lock()
            .unwrap()
            .iter()
            .all(|request| request.method == "GET"));
    }
    #[tokio::test]
    async fn rejected_reload_preserves_memory_and_disk_and_uses_only_selected_endpoint() {
        let runtime = json!({"old_runtime": true});
        let old_runtime = runtime.clone();
        let endpoint = server(move |request| {
            if request.method == "GET" {
                (200, old_runtime.clone())
            } else {
                (400, json!({"error": "port occupied"}))
            }
        })
        .await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut original = config();
        original.caddy_admin = endpoint.address.clone();
        original
            .projects
            .get_mut("demo")
            .unwrap()
            .environments
            .insert(
                "prod".into(),
                Environment {
                    proxy: Default::default(),
                    health: Default::default(),
                    addr: "http://127.0.0.1:4000".into(),
                    desc: String::new(),
                    insecure_skip_verify: false,
                },
            );
        store.replace_config(original).unwrap();
        let disk = std::fs::read(&file.0).unwrap();
        let error = commit_change(
            &mut store,
            &client,
            Change::SwitchEnvironment("demo".into(), "prod".into()),
        )
        .await
        .unwrap_err();
        assert!(format!("{:#}", error).contains("port occupied"));
        assert_eq!(store.get_project("demo").unwrap().current, "dev");
        assert_eq!(std::fs::read(&file.0).unwrap(), disk);
        assert_eq!(endpoint.requests.lock().unwrap().len(), 3);
        assert_eq!(client.admin_url(), format!("http://{}", endpoint.address));
    }
    #[tokio::test]
    async fn successful_reload_is_persisted_and_survives_reopening_store() {
        let endpoint = server(|_| (200, json!({}))).await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut p = project("demo", false, "http://127.0.0.1:3000");
        let mut initial = Config::default();
        initial.caddy_admin = endpoint.address.clone();
        store.replace_config(initial).unwrap();
        p.desc = "saved".into();
        commit_change(&mut store, &client, Change::CreateProject(p))
            .await
            .unwrap();
        let reopened = Store::new(file.0.to_str().unwrap()).unwrap();
        assert_eq!(reopened.get_project("demo").unwrap().desc, "saved");
        let requests = endpoint.requests.lock().unwrap();
        assert_eq!(requests[1].path, "/load");
        assert!(requests[1].body["apps"]["http"]["servers"].is_object());
    }
    #[tokio::test]
    async fn failed_disk_save_restores_the_actual_previous_runtime() {
        let previous_runtime =
            json!({"apps": {"http": {"servers": {"external": {"listen": [":19000"]}}}}});
        let snapshot = previous_runtime.clone();
        let endpoint = server(move |request| {
            if request.method == "GET" {
                (200, snapshot.clone())
            } else {
                (200, json!({}))
            }
        })
        .await;
        let client = Client::new(&endpoint.address);
        let (mut store, file) = store();
        let mut initial = config();
        initial.caddy_admin = endpoint.address.clone();
        store.replace_config(initial).unwrap();
        // A directory at the destination deterministically rejects atomic replacement.
        std::fs::remove_file(&file.0).unwrap();
        std::fs::create_dir(&file.0).unwrap();
        let error = commit_change(&mut store, &client, Change::DeleteProject("demo".into()))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("已恢复原配置"));
        assert!(store.get_project("demo").is_some());
        let requests = endpoint.requests.lock().unwrap();
        assert_eq!(requests.len(), 3);
        assert_eq!(requests[2].body, previous_runtime);
    }
}

#[cfg(test)]
mod response_recovery_tests {
    use super::*;
    use crate::test_support::server;
    use serde_json::json;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };
    #[tokio::test]
    async fn error_response_after_runtime_changed_restores_snapshot_without_saving() {
        let original_runtime = json!({"apps": {"http": {"servers": {}}}, "unchanged": true});
        let runtime = Arc::new(Mutex::new(original_runtime.clone()));
        let posts = Arc::new(AtomicUsize::new(0));
        let (server_runtime, server_posts) = (runtime.clone(), posts.clone());
        let endpoint = server(move |request| {
            if request.method == "GET" {
                return (200, server_runtime.lock().unwrap().clone());
            }
            *server_runtime.lock().unwrap() = request.body.clone();
            let code = if server_posts.fetch_add(1, Ordering::SeqCst) == 0 {
                500
            } else {
                200
            };
            (code, json!({}))
        })
        .await;
        let directory = crate::test_support::Directory::new();
        let file = directory.0.join("config.json");
        let mut store = Store::new(file.to_str().unwrap()).unwrap();
        let p = crate::caddy::generator::tests::project("demo", false, "http://127.0.0.1:3000");
        store
            .replace_config(Config {
                caddy_admin: endpoint.address.clone(),
                projects: std::collections::HashMap::from([("demo".into(), p)]),
                ..Config::default()
            })
            .unwrap();
        let disk = std::fs::read(&file).unwrap();
        let error = commit_change(
            &mut store,
            &Client::new(&endpoint.address),
            Change::DeleteProject("demo".into()),
        )
        .await
        .unwrap_err();
        assert!(error.to_string().contains("运行配置已恢复"));
        assert_eq!(*runtime.lock().unwrap(), original_runtime);
        assert!(store.get_project("demo").is_some());
        assert_eq!(std::fs::read(file).unwrap(), disk);
    }
}
