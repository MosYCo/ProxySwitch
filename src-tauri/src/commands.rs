use crate::configuration::{self, Change};
use crate::events;
use crate::health::HealthChecker;
use crate::model::*;
use crate::{validation, AppState};
use std::collections::HashMap;
use tauri::{Emitter, State};

pub(crate) fn notify_config_changed(state: &AppState) {
    state.app_handle.emit(events::CONFIG_CHANGED, ()).ok();
    let checker = state.health_checker.clone();
    tauri::async_runtime::spawn(async move {
        checker.read().await.wake();
    });
}

async fn commit(state: &AppState, change: Change) -> Result<Config, String> {
    let _operation = state.config_operation.lock().await;
    let mut store = state.store.write().await;
    let result = if !state.caddy_manager.read().await.is_running()
        && state.caddy_client.health_check().await.is_err()
    {
        match change.prepare(store.get_config()) {
            Ok(next) => store.replace_config(next.clone()).map(|_| next),
            Err(error) => Err(error),
        }
    } else {
        configuration::commit_change(&mut store, &state.caddy_client, change).await
    };
    match result {
        Ok(config) => {
            drop(store);
            notify_config_changed(state);
            Ok(config)
        }
        Err(error) => {
            let message = format!("{:#}", error);
            state.logger.warn("system", &message);
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let store = state.store.read().await;
    let mut projects: Vec<_> = store.get_config().projects.values().cloned().collect();
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}
#[tauri::command]
pub async fn get_project(state: State<'_, AppState>, name: String) -> Result<Project, String> {
    state
        .store
        .read()
        .await
        .get_project(&name)
        .cloned()
        .ok_or_else(|| format!("项目「{}」不存在", name))
}
#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    project: Project,
) -> Result<Project, String> {
    let name = project.name.clone();
    let config = commit(&state, Change::CreateProject(project)).await?;
    state
        .logger
        .info("system", &format!("项目已创建: {}", name));
    Ok(config.projects[&name].clone())
}
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    name: String,
    project: Project,
) -> Result<Project, String> {
    let config = commit(&state, Change::UpdateProject(name.clone(), project)).await?;
    state
        .logger
        .info("system", &format!("项目已更新: {}", name));
    Ok(config.projects[&name].clone())
}
#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, name: String) -> Result<(), String> {
    commit(&state, Change::DeleteProject(name.clone())).await?;
    state
        .logger
        .info("system", &format!("项目已删除: {}", name));
    Ok(())
}

#[tauri::command]
pub async fn set_project_enabled(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<ProjectActivation, String> {
    let _operation = state.config_operation.lock().await;
    let engine_running = state.caddy_manager.read().await.is_running();
    let mut store = state.store.write().await;
    let (config, applied) = configuration::set_project_enabled(
        &mut store,
        &state.caddy_client,
        &name,
        enabled,
        engine_running,
    )
    .await
    .map_err(|error| {
        let message = format!("{:#}", error);
        state.logger.warn("proxy", &message);
        message
    })?;
    drop(store);
    state.logger.info(
        "proxy",
        &format!(
            "项目{}{}: {}",
            if enabled { "已启用" } else { "已停用" },
            if applied {
                ""
            } else {
                "（下次启动引擎时生效）"
            },
            name
        ),
    );
    notify_config_changed(&state);
    Ok(ProjectActivation {
        project: config.projects[&name].clone(),
        applied,
    })
}
#[tauri::command]
pub async fn list_environments(
    state: State<'_, AppState>,
    project_name: String,
) -> Result<HashMap<String, Environment>, String> {
    state
        .store
        .read()
        .await
        .get_project(&project_name)
        .map(|p| p.environments.clone())
        .ok_or_else(|| "项目不存在".into())
}
#[tauri::command]
pub async fn create_environment(
    state: State<'_, AppState>,
    project: String,
    name: String,
    env: Environment,
) -> Result<(), String> {
    commit(
        &state,
        Change::CreateEnvironment(project.clone(), name.clone(), env),
    )
    .await?;
    state
        .logger
        .info("system", &format!("环境已添加: {}/{}", project, name));
    Ok(())
}
#[tauri::command]
pub async fn update_environment(
    state: State<'_, AppState>,
    project: String,
    name: String,
    env: Environment,
) -> Result<(), String> {
    commit(
        &state,
        Change::UpdateEnvironment(project.clone(), name.clone(), env),
    )
    .await?;
    state
        .logger
        .info("system", &format!("环境已更新: {}/{}", project, name));
    Ok(())
}
#[tauri::command]
pub async fn delete_environment(
    state: State<'_, AppState>,
    project: String,
    name: String,
) -> Result<(), String> {
    commit(
        &state,
        Change::DeleteEnvironment(project.clone(), name.clone()),
    )
    .await?;
    state
        .logger
        .info("system", &format!("环境已删除: {}/{}", project, name));
    Ok(())
}
#[tauri::command]
pub async fn switch_environment(
    state: State<'_, AppState>,
    project: String,
    environment: String,
) -> Result<(), String> {
    let config = commit(
        &state,
        Change::SwitchEnvironment(project.clone(), environment.clone()),
    )
    .await?;
    state.logger.info(
        "proxy",
        &format!(
            "{} 已{}至 {} → {}",
            project,
            if config.projects[&project].enabled {
                "切换"
            } else {
                "选择环境"
            },
            environment,
            config.projects[&project].environments[&environment].addr
        ),
    );
    state
        .app_handle
        .emit(
            events::ENVIRONMENT_SWITCHED,
            serde_json::json!({"project": project, "environment": environment}),
        )
        .ok();
    Ok(())
}
#[tauri::command]
pub async fn restart_proxy(state: State<'_, AppState>) -> Result<(), String> {
    let _operation = state.config_operation.lock().await;
    let config = state.store.read().await.get_config().clone();
    validation::validate_config(&config).map_err(|e| e.to_string())?;
    state.caddy_client.load_config(&config).await.map_err(|e| {
        let message = format!("重载代理配置失败: {:#}", e);
        state.logger.error("proxy", &message);
        message
    })?;
    state.caddy_client.set_admin_url(&config.caddy_admin);
    state.logger.info("proxy", "代理配置已重载");
    state.app_handle.emit(events::PROXY_RESTARTED, ()).ok();
    Ok(())
}
#[tauri::command]
pub async fn get_proxy_status(state: State<'_, AppState>) -> Result<Vec<ProxyStatus>, String> {
    let store = state.store.read().await;
    Ok(store
        .get_config()
        .projects
        .values()
        .map(|p| ProxyStatus {
            name: p.name.clone(),
            listen: p.listen.clone(),
            enabled: p.enabled,
            current_env: p.current.clone(),
            backend_addr: p
                .environments
                .get(&p.current)
                .map(|e| e.addr.clone())
                .unwrap_or_default(),
        })
        .collect())
}
#[tauri::command]
pub async fn get_health_status(
    state: State<'_, AppState>,
) -> Result<HashMap<String, HashMap<String, HealthStatus>>, String> {
    Ok(state.health_checker.read().await.get_status().clone())
}
#[tauri::command]
pub async fn force_health_check(state: State<'_, AppState>) -> Result<(), String> {
    HealthChecker::force_check_shared(
        state.health_checker.clone(),
        &state.store,
        &state.logger,
        &state.app_handle,
    )
    .await;
    Ok(())
}
#[tauri::command]
pub async fn get_logs(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    Ok(state
        .logger
        .get_recent(limit.unwrap_or_else(|| state.logger.capacity())))
}
#[tauri::command]
pub async fn get_logs_by_level(
    state: State<'_, AppState>,
    level: String,
) -> Result<Vec<LogEntry>, String> {
    Ok(state.logger.get_by_level(&level))
}
#[tauri::command]
pub async fn get_logs_by_category(
    state: State<'_, AppState>,
    category: String,
) -> Result<Vec<LogEntry>, String> {
    Ok(state.logger.get_by_category(&category))
}
#[tauri::command]
pub async fn clear_logs(
    state: State<'_, AppState>,
    source: Option<LogSource>,
) -> Result<LogClearResult, String> {
    let result = state.logger.clear(source);
    state.app_handle.emit(events::LOGS_CLEARED, &result).ok();
    Ok(result)
}
#[tauri::command]
pub async fn get_caddy_status(state: State<'_, AppState>) -> Result<CaddyStatus, String> {
    let (running, managed, pid, uptime_secs) = {
        let mgr = state.caddy_manager.read().await;
        (
            mgr.is_running(),
            mgr.managed(),
            mgr.pid(),
            mgr.uptime_secs(),
        )
    };
    let (reachable, error) = match state.caddy_client.health_check().await {
        Ok(()) => (true, None),
        Err(e) => (false, Some(format!("{:#}", e))),
    };
    Ok(CaddyStatus {
        running,
        managed,
        pid,
        uptime_secs,
        reachable,
        error,
    })
}
#[tauri::command]
pub async fn get_caddy_settings(state: State<'_, AppState>) -> Result<CaddySettings, String> {
    let admin = state.store.read().await.get_config().caddy_admin.clone();
    Ok(CaddySettings {
        admin,
        applied: state.caddy_client.health_check().await.is_ok(),
    })
}
#[tauri::command]
pub async fn update_caddy_settings(
    state: State<'_, AppState>,
    admin: String,
) -> Result<CaddySettings, String> {
    let admin = normalize_caddy_admin_listen(&admin)?;
    let _operation = state.config_operation.lock().await;
    let mut store = state.store.write().await;
    let change = Change::SetAdmin(admin.clone());
    let running = state.caddy_manager.read().await.is_running();
    let applied = if !running && state.caddy_client.health_check().await.is_err() {
        // An explicitly saved address can be used on the next start while offline.
        let next = change
            .prepare(store.get_config())
            .map_err(|e| e.to_string())?;
        store.replace_config(next).map_err(|e| e.to_string())?;
        state.caddy_client.set_admin_url(&admin);
        false
    } else {
        configuration::commit_change(&mut store, &state.caddy_client, change)
            .await
            .map_err(|e| format!("{:#}", e))?;
        true
    };
    state.logger.info(
        "system",
        &format!(
            "管理地址已保存{}: {}",
            if applied {
                "并生效"
            } else {
                "，下次启动生效"
            },
            admin
        ),
    );
    Ok(CaddySettings { admin, applied })
}

pub async fn start_managed_caddy(state: &AppState) -> Result<(), String> {
    let _operation = state.config_operation.lock().await;
    let config = state.store.read().await.get_config().clone();
    validation::validate_config(&config).map_err(|e| e.to_string())?;
    let mut mgr = state.caddy_manager.write().await;
    if mgr.is_running() {
        return Ok(());
    }
    if state.caddy_client.health_check().await.is_ok() {
        return Err("管理地址已有外部 Caddy 服务，本应用未启动或覆盖该实例".into());
    }
    mgr.start(state.logger.clone(), &config)
        .await
        .map_err(|e| e.to_string())?;
    state.caddy_client.set_admin_url(&config.caddy_admin);
    state.logger.info(
        "system",
        &format!(
            "Caddy 已启动（PID: {}），{} 个项目的代理配置已生效",
            mgr.pid(),
            config
                .projects
                .values()
                .filter(|project| project.has_proxy_route())
                .count()
        ),
    );
    state.app_handle.emit(events::CADDY_STATUS_CHANGED, ()).ok();
    Ok(())
}
#[tauri::command]
pub async fn start_caddy(state: State<'_, AppState>) -> Result<(), String> {
    start_managed_caddy(&state).await.map_err(|message| {
        state
            .logger
            .error("system", &format!("启动 Caddy 失败: {}", message));
        message
    })
}
#[tauri::command]
pub async fn stop_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let _operation = state.config_operation.lock().await;
    state
        .caddy_manager
        .write()
        .await
        .stop()
        .await
        .map_err(|e| {
            let message = format!("停止 Caddy 失败: {:#}", e);
            state.logger.error("system", &message);
            message
        })?;
    state
        .logger
        .info("system", "Caddy 已停止，所有代理入口暂停服务");
    state.app_handle.emit(events::CADDY_STATUS_CHANGED, ()).ok();
    Ok(())
}
#[tauri::command]
pub async fn restart_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let _operation = state.config_operation.lock().await;
    let config = state.store.read().await.get_config().clone();
    validation::validate_config(&config).map_err(|e| e.to_string())?;
    let mut mgr = state.caddy_manager.write().await;
    if !mgr.is_running() && state.caddy_client.health_check().await.is_ok() {
        return Err("不能重启未由本应用托管的 Caddy 服务".into());
    }
    mgr.restart(state.logger.clone(), &config)
        .await
        .map_err(|e| {
            let message = format!("重启 Caddy 失败: {:#}", e);
            state.logger.error("system", &message);
            message
        })?;
    state.caddy_client.set_admin_url(&config.caddy_admin);
    state.logger.info(
        "system",
        &format!("Caddy 已重启（PID: {}），代理配置已生效", mgr.pid()),
    );
    state.app_handle.emit(events::CADDY_STATUS_CHANGED, ()).ok();
    Ok(())
}
pub(crate) fn normalize_caddy_admin_listen(input: &str) -> Result<String, String> {
    let value = input.trim();
    let candidate = if value.starts_with(':') {
        format!("http://127.0.0.1{}", value)
    } else if value.starts_with("http://") {
        value.to_string()
    } else if value.starts_with("https://") {
        return Err("管理接口暂不支持 HTTPS，请填写 HTTP 监听地址".into());
    } else {
        format!("http://{}", value)
    };
    let url = url::Url::parse(&candidate).map_err(|_| "管理地址格式无效".to_string())?;
    if url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("管理地址不能包含路径、认证信息、查询参数或片段".into());
    }
    let host = match url.host() {
        Some(url::Host::Ipv6(ip)) => format!("[{}]", ip),
        Some(host) => host.to_string(),
        None => return Err("管理地址缺少主机名".into()),
    };
    let port = url
        .port()
        .filter(|p| *p != 0)
        .ok_or_else(|| "管理地址必须包含有效端口".to_string())?;
    Ok(if value.starts_with(':') {
        format!(":{}", port)
    } else {
        format!("{}:{}", host, port)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_admin_addresses_without_silently_dropping_https() {
        assert_eq!(
            normalize_caddy_admin_listen("http://localhost:2019").unwrap(),
            "localhost:2019"
        );
        assert_eq!(normalize_caddy_admin_listen(":2019").unwrap(), ":2019");
        assert_eq!(
            normalize_caddy_admin_listen("[::1]:2019").unwrap(),
            "[::1]:2019"
        );
        for value in [
            "https://localhost:2019",
            "localhost",
            "localhost:0",
            "localhost:invalid",
            "http://localhost:2019/config",
        ] {
            assert!(normalize_caddy_admin_listen(value).is_err(), "{}", value);
        }
    }
}
