#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod caddy;
mod commands;
mod health;
mod logger;
mod model;
mod store;
mod validation;

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

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
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve config path
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve config dir");
            std::fs::create_dir_all(&config_dir).ok();
            let config_path = config_dir.join("config.json");

            // Resolve log dir
            let log_dir = app
                .path()
                .app_log_dir()
                .expect("failed to resolve log dir");
            std::fs::create_dir_all(&log_dir).ok();

            // Initialize store
            let store = Store::new(config_path.to_str().unwrap())
                .expect("failed to initialize store");

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
            let logger = Logger::new(log_dir.to_str().unwrap())
                .expect("failed to initialize logger");

            // Create app state
            let state = AppState {
                app_handle: app.handle().clone(),
                store: Arc::new(RwLock::new(store)),
                caddy_manager: Arc::new(RwLock::new(caddy_manager)),
                caddy_client: Arc::new(caddy_client),
                health_checker: Arc::new(RwLock::new(health_checker)),
                logger: Arc::new(logger),
            };

            app.manage(state);

            // Start Caddy sidecar
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let mut mgr = state.caddy_manager.write().await;
                if let Err(e) = mgr.start().await {
                    tracing::warn!("Failed to start Caddy: {}", e);
                } else {
                    tracing::info!("Caddy started");
                }
            });

            // Load initial Caddy config
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                let state = app_handle.state::<AppState>();
                let store = state.store.read().await;
                let config = store.get_config();
                if let Err(e) = state.caddy_client.load_config(&config).await {
                    tracing::warn!("Failed to load initial Caddy config: {}", e);
                } else {
                    tracing::info!("Initial Caddy config loaded");
                }
            });

            // Start health checker
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let mut checker = state.health_checker.write().await;
                checker
                    .start(state.store.clone(), state.logger.clone(), app_handle.clone())
                    .await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
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
            commands::start_caddy,
            commands::stop_caddy,
            commands::restart_caddy,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray instead of closing
                window.hide().ok();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
