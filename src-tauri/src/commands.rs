use crate::model::*;
use crate::validation;
use crate::AppState;
use std::collections::HashMap;
use tauri::State;

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

    // Reload Caddy config
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state.caddy_client.load_config(&config).await {
        state
            .logger
            .warn("caddy", &format!("重新加载 Caddy 配置失败: {}", e));
    }

    state
        .logger
        .info("system", &format!("项目已更新: {}", name));

    Ok(updated)
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let mut store = state.store.write().await;
    store.delete_project(&name).map_err(|e| e.to_string())?;

    // Reload Caddy config
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state.caddy_client.load_config(&config).await {
        state
            .logger
            .warn("caddy", &format!("重新加载 Caddy 配置失败: {}", e));
    }

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

    // Reload Caddy config
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state.caddy_client.load_config(&config).await {
        state
            .logger
            .warn("caddy", &format!("重新加载 Caddy 配置失败: {}", e));
    }

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

    // Reload Caddy config
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state.caddy_client.load_config(&config).await {
        state
            .logger
            .warn("caddy", &format!("重新加载 Caddy 配置失败: {}", e));
    }

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

    // Build and load config
    let config = store.get_config().clone();
    drop(store);

    state
        .caddy_client
        .load_config(&config)
        .await
        .map_err(|e| e.to_string())?;

    state.logger.info(
        "proxy",
        &format!("环境已切换: {} → {}", project, environment),
    );

    Ok(())
}

#[tauri::command]
pub async fn restart_proxy(state: State<'_, AppState>) -> Result<(), String> {
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);

    state
        .caddy_client
        .load_config(&config)
        .await
        .map_err(|e| e.to_string())?;

    state.logger.info("proxy", "代理已重启");

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
    let mut checker = state.health_checker.write().await;
    checker
        .force_check(&state.store, &state.logger, &state.app_handle)
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

    let apply_result = match state.caddy_client.load_config(&config).await {
        Ok(()) => Ok(()),
        Err(_) => {
            state
                .caddy_client
                .load_config_via("localhost:2019", &config)
                .await
        }
    };

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

    state.logger.info("caddy", "Caddy 已启动");

    // Load config after start
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state
        .caddy_client
        .load_config_via("localhost:2019", &config)
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

    state.logger.info("caddy", "Caddy 已停止");

    Ok(())
}

#[tauri::command]
pub async fn restart_caddy(state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.caddy_manager.write().await;
    mgr.restart(state.logger.clone())
        .await
        .map_err(|e| e.to_string())?;

    state.logger.info("caddy", "Caddy 已重启");

    // Load config after restart
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let store = state.store.read().await;
    let config = store.get_config().clone();
    drop(store);
    if let Err(e) = state
        .caddy_client
        .load_config_via("localhost:2019", &config)
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
