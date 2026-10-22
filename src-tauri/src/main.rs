#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod caddy;
mod commands;
mod configuration;
mod events;
mod health;
mod logger;
mod model;
mod preferences;
mod settings;
mod store;
#[cfg(test)]
mod test_support;
mod updater;
mod validation;

use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tokio::sync::{Mutex, RwLock};

use crate::caddy::{Client as CaddyClient, Manager as CaddyManager};
use crate::health::HealthChecker;
use crate::logger::Logger;
use crate::store::Store;

pub struct AppState {
    pub app_handle: AppHandle,
    pub store: Arc<RwLock<Store>>,
    pub caddy_manager: Arc<RwLock<CaddyManager>>,
    pub caddy_client: Arc<CaddyClient>,
    pub health_checker: Arc<RwLock<HealthChecker>>,
    pub logger: Arc<Logger>,
    pub config_operation: Mutex<()>,
}

const TRAY_SHOW_ID: &str = "tray_show";
const TRAY_QUIT_ID: &str = "tray_quit";

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.show().ok();
        window.unminimize().ok();
        window.set_focus().ok();
    }
}

fn quit_app(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        {
            let state = app.state::<AppState>();
            let _operation = state.config_operation.lock().await;
            let mut mgr = state.caddy_manager.write().await;
            if let Err(e) = mgr.stop().await {
                state
                    .logger
                    .warn("caddy", &format!("退出时停止 Caddy 失败: {}", e));
                tracing::warn!("Failed to stop Caddy while quitting: {}", e);
            } else {
                state.logger.info("system", "应用正在退出");
            }
        }

        app.exit(0);
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            // Resolve config path
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve config dir");
            std::fs::create_dir_all(&config_dir).ok();
            let config_path = config_dir.join("config.json");

            // Resolve log dir
            let log_dir = app.path().app_log_dir().expect("failed to resolve log dir");
            std::fs::create_dir_all(&log_dir).ok();

            // Initialize store
            let store =
                Store::new(config_path.to_str().unwrap()).expect("failed to initialize store");

            // Get caddy admin URL from config
            let caddy_admin = {
                let config = store.get_config();
                if config.caddy_admin.is_empty() {
                    "localhost:2019".to_string()
                } else {
                    config.caddy_admin.clone()
                }
            };

            // Initialize Caddy manager (sidecar)
            let caddy_manager = CaddyManager::new(app.handle().clone());

            // Initialize Caddy client
            let caddy_client = CaddyClient::new(&caddy_admin);

            // Initialize health checker
            let health_checker = HealthChecker::new(std::time::Duration::from_secs(30));

            // Initialize logger
            let logger =
                Logger::new(log_dir.to_str().unwrap()).expect("failed to initialize logger");
            let startup = store.get_config().settings.startup.clone();
            logger.configure(store.get_config().settings.logs.clone());
            logger.set_app_handle(app.handle().clone());
            logger.info(
                "system",
                &format!(
                    "软件已启动 · v{} · 已载入 {} 个项目，其中 {} 个已启用",
                    env!("CARGO_PKG_VERSION"),
                    store.get_config().projects.len(),
                    store
                        .get_config()
                        .projects
                        .values()
                        .filter(|project| project.enabled)
                        .count()
                ),
            );

            // Create app state
            let state = AppState {
                app_handle: app.handle().clone(),
                store: Arc::new(RwLock::new(store)),
                caddy_manager: Arc::new(RwLock::new(caddy_manager)),
                caddy_client: Arc::new(caddy_client),
                health_checker: Arc::new(RwLock::new(health_checker)),
                logger: Arc::new(logger),
                config_operation: Mutex::new(()),
            };

            app.manage(state);

            let show_item = MenuItemBuilder::with_id(TRAY_SHOW_ID, "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id(TRAY_QUIT_ID, "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(tray_menu))?;
                tray.on_menu_event(|app, event| match event.id().as_ref() {
                    TRAY_SHOW_ID => show_main_window(app),
                    TRAY_QUIT_ID => quit_app(app.clone()),
                    _ => {}
                });
                tray.on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => show_main_window(tray.app_handle()),
                    _ => {}
                });
            } else {
                let mut tray_builder = TrayIconBuilder::with_id("main")
                    .menu(&tray_menu)
                    .tooltip(
                        app.config()
                            .product_name
                            .as_deref()
                            .unwrap_or(env!("CARGO_PKG_NAME")),
                    )
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        TRAY_SHOW_ID => show_main_window(app),
                        TRAY_QUIT_ID => quit_app(app.clone()),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                        | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => show_main_window(tray.app_handle()),
                        _ => {}
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                tray_builder.build(app)?;
            }

            // Start Caddy sidecar
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let start_caddy = state
                    .store
                    .read()
                    .await
                    .get_config()
                    .settings
                    .startup
                    .start_caddy;
                if start_caddy {
                    if let Err(e) = commands::start_managed_caddy(&state).await {
                        state
                            .logger
                            .error("system", &format!("自动启动 Caddy 失败: {}", e));
                        tracing::warn!("Failed to start Caddy: {}", e);
                    }
                }
            });

            if startup.start_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide().ok();
                }
            } else if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
            }
            let recovery_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let state = recovery_app.state::<AppState>();
                    let _operation = state.config_operation.lock().await;
                    let config = state.store.read().await.get_config().clone();
                    state
                        .caddy_manager
                        .write()
                        .await
                        .recover_if_needed(state.logger.clone(), &config)
                        .await;
                }
            });

            // Start health checker
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                HealthChecker::run(
                    state.health_checker.clone(),
                    state.store.clone(),
                    state.logger.clone(),
                    app_handle.clone(),
                )
                .await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::set_project_enabled,
            commands::delete_project,
            commands::list_environments,
            commands::create_environment,
            commands::update_environment,
            commands::delete_environment,
            commands::switch_environment,
            commands::restart_proxy,
            commands::get_proxy_status,
            commands::get_health_status,
            commands::force_health_check,
            commands::get_logs,
            commands::get_logs_by_level,
            commands::get_logs_by_category,
            commands::clear_logs,
            commands::get_caddy_status,
            commands::get_caddy_settings,
            commands::update_caddy_settings,
            commands::start_caddy,
            commands::stop_caddy,
            commands::restart_caddy,
            settings::get_app_settings,
            settings::update_app_settings,
            settings::preview_import,
            settings::import_projects,
            settings::export_projects,
            settings::list_backups,
            settings::create_backup,
            settings::restore_backup,
            updater::get_updater_status,
            updater::check_app_update,
            updater::download_app_update,
            updater::install_app_update,
            updater::open_release_page,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let action = app
                        .state::<AppState>()
                        .store
                        .read()
                        .await
                        .get_config()
                        .settings
                        .startup
                        .close_action
                        .clone();
                    if action == "quit" {
                        quit_app(app);
                    } else if let Some(window) = app.get_webview_window("main") {
                        window.hide().ok();
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
