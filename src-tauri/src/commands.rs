use crate::health::HealthChecker;
use crate::model::*;
use crate::validation;
use crate::AppState;
use std::collections::HashMap;
use tauri::{Emitter, State};

async fn reload_caddy_config(state: &State<'_, AppState>, config: &Config, action: &str) {
    match state
        .caddy_client
        .load_config_with_default_admin(config)
        .await
    {
        Ok(()) => state.caddy_client.set_admin_url(&config.caddy_admin),
        Err(e) => {
            state.logger.warn(
                "caddy",
                &format!("{}时重新加载 Caddy 配置失败: {}", action, e),
            );
        }
    }
}

async fn require_caddy_reload(state: &State<'_, AppState>, config: &Config) -> Result<(), String> {
    state
        .caddy_client
        .load_config_with_default_admin(config)
        .await
        .map_err(|e| e.to_string())?;
    state.caddy_client.set_admin_url(&config.caddy_admin);
    Ok(())
}

// ============ Project Commands ============

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let store = state.store.read().await;
    Ok(store.get_config().projects.values().cloned().collect())
}

#[tauri::command]
pub async fn get_project(state: State<'_, AppState>, name: String) -> Result<Project, String> {
    let store = state.store.read().await;
    store
        .get_project(&name)
        .cloned()
        .ok_or_else(|| format!("项目 {:?} 不存在", name))
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    project: Project,
) -> Result<Project, String> {
    validation::validate_project(&project).map_err(|e| e.to_string())?;

    let mut store = state.store.write().await;
    store
        .set_project(project.clone())
        .map_err(|e| e.to_string())?;
    let config = store.get_config().clone();
    drop(store);

    reload_caddy_config(&state, &config, "创建项目").await;

    state
        .logger
        .info("system", &format!("项目已创建: {}", project.name));

    Ok(project)
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    name: String,
    project: Project,
) -> Result<Project, String> {
    let mut store = state.store.write().await;

    // Verify project exists
    if store.get_project(&name).is_none() {
        return Err(format!("项目 {:?} 不存在", name));
    }

    let mut updated = project.clone();
    updated.name = name.clone();
    validation::validate_project(&updated).map_err(|e| e.to_string())?;

    store
        .set_project(updated.clone())
        .map_err(|e| e.to_string())?;

    let config = store.get_config().clone();
    drop(store);
    reload_caddy_config(&state, &config, "更新项目").await;

    state
        .logger
        .info("system", &format!("项目已更新: {}", name));

    Ok(updated)
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let mut store = state.store.write().await;
    store.delete_project(&name).map_err(|e| e.to_string())?;

    let config = store.get_config().clone();
    drop(store);
    reload_caddy_config(&state, &config, "删除项目").await;

    state
        .logger
        .info("system", &format!("项目已删除: {}", name));

    Ok(())
}

// ============ Environment Commands ============

#[tauri::command]
pub async fn list_environments(
    state: State<'_, AppState>,
    project_name: String,
) -> Result<HashMap<String, Environment>, String> {
    let store = state.store.read().await;
    store
        .get_project(&project_name)
        .map(|p| p.environments.clone())
        .ok_or_else(|| format!("项目 {:?} 不存在", project_name))
}

#[tauri::command]
pub async fn create_environment(
    state: State<'_, AppState>,
    project: String,
    name: String,
    env: Environment,
) -> Result<(), String> {
    validation::validate_name("environment name", &name).map_err(|e| e.to_string())?;
    validation::validate_environment(&env).map_err(|e| e.to_string())?;

    let mut store = state.store.write().await;
    store
        .set_environment(&project, &name, env)
        .map_err(|e| e.to_string())?;
    let config = store.get_config().clone();
    drop(store);

    reload_caddy_config(&state, &config, "添加环境").await;

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
    validation::validate_environment(&env).map_err(|e| e.to_string())?;

    let mut store = state.store.write().await;
    store
        .set_environment(&project, &name, env)
        .map_err(|e| e.to_string())?;

    let config = store.get_config().clone();
    drop(store);
    reload_caddy_config(&state, &config, "更新环境").await;

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
    let mut store = state.store.write().await;
    store
        .delete_environment(&project, &name)
        .map_err(|e| e.to_string())?;

    let config = store.get_config().clone();
    drop(store);
    reload_caddy_config(&state, &config, "删除环境").await;

    state
        .logger
        .info("system", &format!("环境已删除: {}/{}", project, name));

    Ok(())
}

// ============ Proxy Commands ============

#[tauri::command]
pub async fn switch_environment(
    state: State<'_, AppState>,
    project: String,
    environment: String,
) -> Result<(), String> {
    let mut store = state.store.write().await;
    store
        .set_current_environment(&project, &environment)
        .map_err(|e| e.to_string())?;

    let config = store.get_config().clone();
    drop(store);

    require_caddy_reload(&state, &config).await?;

    state.logger.info(
        "proxy",
        &format!("环境已切换: {} → {}", project, environment),
    );
    state
        .app_handle
        .emit(
            "environment.switched",
            serde_json::json!({
                "project": project,
                "environment": environment,
            }),
        )
        .ok();

    Ok(())
}

#[tauri::command]
pub async fn restart_proxy(state: State<'_, AppState>) -> Result<(), String> {
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);

    require_caddy_reload(&state, &config).await?;

    state.logger.info("proxy", "代理已重启");
    state
        .app_handle
        .emit("proxy.restarted", serde_json::json!({}))
        .ok();

    Ok(())
}

#[tauri::command]
pub async fn get_proxy_status(state: State<'_, AppState>) -> Result<Vec<ProxyStatus>, String> {
    let store = state.store.read().await;
    let config = store.get_config();

    let mut statuses = Vec::new();
    for (name, project) in &config.projects {
        let env = project.environments.get(&project.current);
        statuses.push(ProxyStatus {
            name: name.clone(),
            listen: project.listen.clone(),
            current_env: project.current.clone(),
            backend_addr: env.map(|e| e.addr.clone()).unwrap_or_default(),
        });
    }

    Ok(statuses)
}

// ============ Health Commands ============

#[tauri::command]
pub async fn get_health_status(
    state: State<'_, AppState>,
) -> Result<HashMap<String, HashMap<String, HealthStatus>>, String> {
    let checker = state.health_checker.read().await;
    Ok(checker.get_status().clone())
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

// ============ Log Commands ============

#[tauri::command]
pub async fn get_logs(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    Ok(state.logger.get_recent(limit.unwrap_or(100)))
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
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.logger.clear();
    Ok(())
}

// ============ Caddy Commands ============

#[tauri::command]
pub async fn get_caddy_status(state: State<'_, AppState>) -> Result<CaddyStatus, String> {
    let mgr = state.caddy_manager.read().await;
    let running = mgr.is_running();
    let managed = mgr.managed();
    let pid = mgr.pid();
    let uptime_secs = mgr.uptime_secs();

    // Check if Caddy is reachable
    let (reachable, error) = match state.caddy_client.health_check().await {
        Ok(()) => (true, None),
        Err(e) => (false, Some(e.to_string())),
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
    let store = state.store.read().await;
    Ok(CaddySettings {
        admin: store.get_config().caddy_admin.clone(),
    })
}

#[tauri::command]
pub async fn update_caddy_settings(
    state: State<'_, AppState>,
    admin: String,
) -> Result<CaddySettings, String> {
    let admin = normalize_caddy_admin_listen(&admin)?;
    let config = {
        let mut store = state.store.write().await;
        store
            .set_caddy_admin(admin.clone())
            .map_err(|e| e.to_string())?;
        store.get_config().clone()
    };

    let apply_result = state
        .caddy_client
        .load_config_with_default_admin(&config)
        .await;

    match apply_result {
        Ok(()) => {
            state.caddy_client.set_admin_url(&admin);
            state
                .logger
                .info("caddy", &format!("Caddy 管理地址已更新: {}", admin));
        }
        Err(e) => {
            state.logger.warn(
                "caddy",
                &format!("Caddy 管理地址已保存，但当前未能应用: {}", e),
            );
        }
    }

    Ok(CaddySettings { admin })
}

#[tauri::command]
pub async fn start_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.caddy_manager.write().await;
    mgr.start(state.logger.clone())
        .await
        .map_err(|e| e.to_string())?;
    drop(mgr);

    state.logger.info("caddy", "Caddy 已启动");

    // Load config after start
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state
        .caddy_client
        .load_config_with_default_admin(&config)
        .await
    {
        state
            .logger
            .warn("caddy", &format!("加载 Caddy 配置失败: {}", e));
    } else {
        state.caddy_client.set_admin_url(&config.caddy_admin);
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.caddy_manager.write().await;
    mgr.stop().await.map_err(|e| e.to_string())?;
    drop(mgr);

    state.logger.info("caddy", "Caddy 已停止");

    Ok(())
}

#[tauri::command]
pub async fn restart_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.caddy_manager.write().await;
    mgr.restart(state.logger.clone())
        .await
        .map_err(|e| e.to_string())?;
    drop(mgr);

    state.logger.info("caddy", "Caddy 已重启");

    // Load config after restart
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state
        .caddy_client
        .load_config_with_default_admin(&config)
        .await
    {
        state
            .logger
            .warn("caddy", &format!("加载 Caddy 配置失败: {}", e));
    } else {
        state.caddy_client.set_admin_url(&config.caddy_admin);
    }

    Ok(())
}

fn normalize_caddy_admin_listen(input: &str) -> Result<String, String> {
    let value = input.trim();
    if value.is_empty() {
        return Err("管理地址不能为空".to_string());
    }

    if value.starts_with("http://") || value.starts_with("https://") {
        let url = url::Url::parse(value).map_err(|e| format!("管理地址格式无效: {}", e))?;
        if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
            return Err("管理地址不能包含路径、查询参数或片段".to_string());
        }
        let host = url
            .host_str()
            .ok_or_else(|| "管理地址缺少主机名".to_string())?;
        let port = url
            .port()
            .ok_or_else(|| "管理地址必须包含端口".to_string())?;
        return Ok(format!("{}:{}", host, port));
    }

    if !value.contains(':') {
        return Err("管理地址必须包含端口，例如 localhost:2019 或 :2019".to_string());
    }

    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::normalize_caddy_admin_listen;

    #[test]
    fn normalizes_http_admin_listen_values() {
        assert_eq!(
            normalize_caddy_admin_listen("http://localhost:2019").unwrap(),
            "localhost:2019"
        );
        assert_eq!(
            normalize_caddy_admin_listen("https://127.0.0.1:2020").unwrap(),
            "127.0.0.1:2020"
        );
        assert_eq!(normalize_caddy_admin_listen(":2019").unwrap(), ":2019");
    }

    #[test]
    fn rejects_admin_listen_paths() {
        assert!(normalize_caddy_admin_listen("http://localhost:2019/config").is_err());
        assert!(normalize_caddy_admin_listen("localhost").is_err());
    }
}
