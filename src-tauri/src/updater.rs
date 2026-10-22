use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

use crate::{commands, AppState};

const RELEASE_PAGE: &str = "https://github.com/MosYCo/ProxySwitch/releases/latest";

#[derive(Default)]
pub struct UpdateState(Mutex<PendingUpdate>);

#[derive(Default)]
struct PendingUpdate {
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}

#[derive(Serialize)]
pub struct UpdaterStatus {
    current_version: &'static str,
    check_supported: bool,
    install_supported: bool,
    reason: Option<&'static str>,
}

#[derive(Serialize)]
pub struct UpdateMetadata {
    version: String,
    notes: String,
    published_at: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

fn install_supported() -> bool {
    !cfg!(debug_assertions)
        && (cfg!(any(windows, target_os = "macos"))
            || (cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some()))
}

#[tauri::command]
pub fn get_updater_status() -> UpdaterStatus {
    UpdaterStatus {
        current_version: env!("CARGO_PKG_VERSION"),
        check_supported: !cfg!(debug_assertions),
        install_supported: install_supported(),
        reason: if cfg!(debug_assertions) {
            Some("开发模式不检查或安装更新，请使用正式安装版。")
        } else if !install_supported() {
            Some("当前安装格式需手动更新，请从发布页下载对应安装包。AppImage 支持应用内更新。")
        } else {
            None
        },
    }
}

fn require_update_url(url: &url::Url) -> Result<(), String> {
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url
            .path()
            .starts_with("/MosYCo/ProxySwitch/releases/download/")
        || url.username() != ""
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("更新下载地址不属于本项目的 GitHub Release".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    pending: State<'_, UpdateState>,
    state: State<'_, AppState>,
) -> Result<Option<UpdateMetadata>, String> {
    if !get_updater_status().check_supported {
        return Err("请在正式安装版中检查更新".into());
    }
    let mut pending = pending.0.try_lock().map_err(|_| "更新操作正在进行中")?;
    // Do not discard a verified download if a background timer fires later.
    if pending.bytes.is_some() {
        return Ok(pending.update.as_ref().map(metadata));
    }
    let result = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await;
    match result {
        Ok(mut update) => {
            if let Some(update) = &mut update {
                require_update_url(&update.download_url)?;
                update.timeout = Some(Duration::from_secs(15 * 60));
                if pending.update.as_ref().map(|previous| &previous.version)
                    != Some(&update.version)
                {
                    state.logger.info(
                        "system",
                        &format!("发现新版本 v{}，可在“应用更新”中下载", update.version),
                    );
                }
            }
            let result = update.as_ref().map(metadata);
            pending.update = update;
            Ok(result)
        }
        Err(error) => {
            state
                .logger
                .warn("system", &format!("检查应用更新失败: {}", error));
            Err(format!("无法获取更新信息，请检查 GitHub 连接或稍后重试。当前 Release 也可能尚未提供更新清单。详情：{}", error))
        }
    }
}

fn metadata(update: &Update) -> UpdateMetadata {
    UpdateMetadata {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        published_at: update
            .raw_json
            .get("pub_date")
            .and_then(|value| value.as_str())
            .map(String::from),
    }
}

#[tauri::command]
pub async fn download_app_update(
    pending: State<'_, UpdateState>,
    state: State<'_, AppState>,
    on_progress: Channel<DownloadProgress>,
) -> Result<(), String> {
    if !install_supported() {
        return Err("当前运行模式或安装格式不支持应用内更新".into());
    }
    let mut pending = pending.0.try_lock().map_err(|_| "更新操作正在进行中")?;
    let update = pending.update.as_ref().ok_or("请先检查更新")?;
    if pending.bytes.is_some() {
        return Ok(());
    }
    let mut downloaded = 0;
    let mut last_sent = Instant::now() - Duration::from_secs(1);
    let result = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if last_sent.elapsed() >= Duration::from_millis(100) || total == Some(downloaded) {
                    let _ = on_progress.send(DownloadProgress { downloaded, total });
                    last_sent = Instant::now();
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            let _ = on_progress.send(DownloadProgress {
                downloaded: bytes.len() as u64,
                total: Some(bytes.len() as u64),
            });
            pending.bytes = Some(bytes);
            state
                .logger
                .info("system", "应用更新已下载并通过签名校验，等待确认安装");
            Ok(())
        }
        Err(error) => {
            state
                .logger
                .warn("system", &format!("下载或校验应用更新失败: {}", error));
            Err(format!(
                "下载或签名校验失败，未安装更新，可重试。详情：{}",
                error
            ))
        }
    }
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    pending: State<'_, UpdateState>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !install_supported() {
        return Err("当前运行模式或安装格式不支持应用内更新".into());
    }
    let pending = pending.0.try_lock().map_err(|_| "更新操作正在进行中")?;
    let update = pending.update.as_ref().ok_or("请先检查更新")?;
    let bytes = pending.bytes.as_ref().ok_or("请先下载并校验更新")?;
    // Hold the same gate as proxy edits/recovery until the installer takes over.
    let operation = state.config_operation.lock().await;
    {
        let store = state.store.read().await;
        store
            .create_backup(store.get_config().settings.backup.max_backups)
            .map_err(|error| format!("更新前备份失败，未开始安装: {}", error))?;
    }
    let was_running = state.caddy_manager.read().await.is_running();
    state
        .caddy_manager
        .write()
        .await
        .stop()
        .await
        .map_err(|error| format!("停止托管代理失败，未开始安装: {}", error))?;
    state.logger.info(
        "system",
        &format!("正在安装 v{}，应用即将重启", update.version),
    );
    // Windows installers exit/relaunch the process themselves. macOS and
    // AppImage replace the bundle in place, then use Tauri's restart path.
    if let Err(error) = update.install(bytes) {
        drop(operation);
        let recovery = if was_running {
            commands::start_managed_caddy(&state).await.err()
        } else {
            None
        };
        let message = format!(
            "更新安装失败: {}{}",
            error,
            recovery
                .map(|error| format!("；恢复代理失败: {}", error))
                .unwrap_or_default()
        );
        state.logger.error("system", &message);
        return Err(message);
    }
    app.restart();
}

#[tauri::command]
pub fn open_release_page(app: AppHandle) -> Result<(), String> {
    #[allow(deprecated)]
    app.shell()
        .open(RELEASE_PAGE, None)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_downloads_are_limited_to_this_repository_over_https() {
        require_update_url(
            &"https://github.com/MosYCo/ProxySwitch/releases/download/v0.3.0/Moss.ProxySwitch.exe"
                .parse()
                .unwrap(),
        )
        .unwrap();
        for url in [
            "http://github.com/MosYCo/ProxySwitch/releases/download/v0.3.0/app.exe",
            "https://github.com/other/repo/releases/download/v0.3.0/app.exe",
            "https://github.com.evil.example/MosYCo/ProxySwitch/releases/download/app.exe",
            "https://user@github.com/MosYCo/ProxySwitch/releases/download/app.exe",
            "https://github.com:8443/MosYCo/ProxySwitch/releases/download/app.exe",
        ] {
            assert!(require_update_url(&url.parse().unwrap()).is_err(), "{url}");
        }
    }
}
