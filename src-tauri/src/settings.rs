use crate::{
    commands,
    configuration::{self, Change},
    model::{AppSettings, Config},
    store::parse_config,
    validation, AppState,
};
use serde::Serialize;
use tauri::{Manager, State};

#[derive(Serialize)]
pub struct SettingsView {
    pub admin: String,
    pub settings: AppSettings,
    pub autostart_supported: bool,
    pub backup_dir: String,
}
#[derive(Serialize)]
pub struct ImportPreview {
    pub projects: Vec<String>,
    pub replaced: Vec<String>,
}
#[derive(Serialize)]
pub struct BackupInfo {
    pub id: String,
    pub projects: usize,
}

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<SettingsView, String> {
    let store = state.store.read().await;
    Ok(SettingsView {
        admin: store.get_config().caddy_admin.clone(),
        settings: store.get_config().settings.clone(),
        autostart_supported: cfg!(windows),
        backup_dir: store.backup_dir().display().to_string(),
    })
}

pub(crate) async fn apply(state: &AppState, change: Change) -> Result<bool, String> {
    let _operation = state.config_operation.lock().await;
    let mut store = state.store.write().await;
    let previous = store.get_config().clone();
    let next = change.prepare(&previous).map_err(|e| format!("{:#}", e))?;
    commands::normalize_caddy_admin_listen(&next.caddy_admin)?;
    let changed_autostart =
        previous.settings.startup.launch_at_login != next.settings.startup.launch_at_login;
    if changed_autostart {
        set_launch_at_login(next.settings.startup.launch_at_login)
            .map_err(|e| format!("开机自启设置失败: {:#}", e))?;
    }
    let online = state.caddy_manager.read().await.is_running()
        || state.caddy_client.health_check().await.is_ok();
    let saved = if online {
        configuration::commit_change(
            &mut store,
            &state.caddy_client,
            Change::Replace(next.clone()),
        )
        .await
        .map(|_| ())
    } else {
        store.replace_config(next.clone())
    };
    if let Err(error) = saved {
        let rollback = if changed_autostart {
            set_launch_at_login(previous.settings.startup.launch_at_login)
        } else {
            Ok(())
        };
        return Err(format!(
            "{:#}{}",
            error,
            rollback
                .err()
                .map(|e| format!("；恢复开机自启失败: {:#}", e))
                .unwrap_or_default()
        ));
    }
    state.caddy_client.set_admin_url(&next.caddy_admin);
    state.logger.configure(next.settings.logs.clone());
    // Wake the checker so interval/path/selection changes apply immediately.
    state.health_checker.read().await.wake();
    drop(store);
    commands::notify_config_changed(state);
    state.logger.info("system", "设置与配置已保存");
    Ok(online)
}

#[tauri::command]
pub async fn update_app_settings(
    state: State<'_, AppState>,
    admin: String,
    settings: AppSettings,
) -> Result<bool, String> {
    let admin = commands::normalize_caddy_admin_listen(&admin)?;
    apply(&state, Change::Settings(admin, settings)).await
}

#[tauri::command]
pub async fn preview_import(
    state: State<'_, AppState>,
    data: String,
) -> Result<ImportPreview, String> {
    let parsed = parse_import(&data)?;
    let store = state.store.read().await;
    let mut projects: Vec<_> = parsed.projects.keys().cloned().collect();
    projects.sort();
    let replaced = projects
        .iter()
        .filter(|name| store.get_project(name).is_some())
        .cloned()
        .collect();
    Ok(ImportPreview { projects, replaced })
}
fn parse_import(data: &str) -> Result<Config, String> {
    if data.len() > 10 * 1024 * 1024 {
        return Err("配置文件不能超过 10 MB".into());
    }
    let value: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    if !value.get("projects").is_some_and(|v| v.is_object()) {
        return Err("文件须包含 projects 项目配置".into());
    }
    let config = parse_config(data).map_err(|e| format!("{:#}", e))?;
    validation::validate_config(&config).map_err(|e| format!("{:#}", e))?;
    Ok(config)
}
#[tauri::command]
pub async fn import_projects(
    state: State<'_, AppState>,
    data: String,
    replace_all: bool,
) -> Result<(), String> {
    let imported = parse_import(&data)?;
    // Prepare the merge under the same gate used by every configuration edit.
    // apply receives a project-only change, preserving unrelated settings and edits.
    apply(
        &state,
        Change::ImportProjects(imported.projects, replace_all),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn export_projects(
    state: State<'_, AppState>,
    project: Option<String>,
) -> Result<String, String> {
    let mut config = state.store.read().await.get_config().clone();
    if let Some(name) = project {
        if !config.projects.contains_key(&name) {
            return Err("项目不存在".into());
        }
        config.projects.retain(|key, _| key == &name);
    }
    let document = serde_json::json!({"version": 1, "projects": config.projects});
    let dir = state
        .app_handle
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "moss-proxyswitch-projects-{}-{}.json",
        chrono::Local::now().format("%Y%m%d-%H%M%S"),
        &uuid::Uuid::new_v4().to_string()[..8]
    ));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(
        serde_json::to_string_pretty(&document)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .and_then(|_| file.sync_all())
    .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub async fn list_backups(state: State<'_, AppState>) -> Result<Vec<BackupInfo>, String> {
    let store = state.store.read().await;
    Ok(store
        .backup_ids()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|id| BackupInfo {
            projects: store
                .read_backup(&id)
                .map(|c| c.projects.len())
                .unwrap_or(0),
            id,
        })
        .collect())
}
#[tauri::command]
pub async fn create_backup(state: State<'_, AppState>) -> Result<String, String> {
    let _operation = state.config_operation.lock().await;
    let store = state.store.read().await;
    store
        .create_backup(store.get_config().settings.backup.max_backups)
        .map_err(|e| format!("{:#}", e))
}
#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    id: String,
    include_settings: bool,
) -> Result<(), String> {
    let config = state
        .store
        .read()
        .await
        .read_backup(&id)
        .map_err(|e| format!("{:#}", e))?;
    let change = if include_settings {
        Change::Replace(config)
    } else {
        Change::ImportProjects(config.projects, true)
    };
    apply(&state, change).await?;
    Ok(())
}

#[cfg(windows)]
fn set_launch_at_login(enabled: bool) -> anyhow::Result<()> {
    use std::os::windows::process::CommandExt;
    const KEY: &str = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    // Keep the legacy value so upgrades update or remove the existing startup entry.
    let mut command = std::process::Command::new("reg.exe");
    command.creation_flags(0x08000000);
    if enabled {
        let exe = std::env::current_exe()?;
        command.args([
            "add",
            KEY,
            "/v",
            "CaddyProxyTools",
            "/t",
            "REG_SZ",
            "/d",
            &format!("\"{}\"", exe.display()),
            "/f",
        ]);
    } else {
        // Deleting an already absent value is a successful disabled state.
        let present = std::process::Command::new("reg.exe")
            .creation_flags(0x08000000)
            .args(["query", KEY, "/v", "CaddyProxyTools"])
            .output()?;
        if !present.status.success() {
            return Ok(());
        }
        command.args(["delete", KEY, "/v", "CaddyProxyTools", "/f"]);
    }
    let output = command.output()?;
    if !output.status.success() {
        anyhow::bail!("{}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_documents_require_projects_and_validate_all_nested_rules() {
        assert!(parse_import("{}").is_err());
        assert!(parse_import(r#"{"projects":[]}"#).is_err());
        assert!(
            parse_import(r#"{"projects":{"x":{"name":"wrong-key","listen":":8080"}}}"#).is_err()
        );
        assert!(parse_import(
            r#"{"projects":{"x":{"name":"x","listen":":8080","proxy":{"connect_timeout_ms":0}}}}"#
        )
        .is_err());
        let parsed = parse_import(
            r#"{"version":1,"projects":{"x":{"name":"x","listen":":8080","enabled":false}}}"#,
        )
        .unwrap();
        assert!(!parsed.projects["x"].enabled);
        assert!(parse_import(&" ".repeat(10 * 1024 * 1024 + 1)).is_err());
    }
}
#[cfg(not(windows))]
fn set_launch_at_login(enabled: bool) -> anyhow::Result<()> {
    if enabled {
        anyhow::bail!("此系统暂不支持开机自启");
    }
    Ok(())
}
