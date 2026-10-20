pub const ENVIRONMENT_SWITCHED: &str = "environment-switched";
pub const PROXY_RESTARTED: &str = "proxy-restarted";
pub const CONFIG_CHANGED: &str = "config-changed";
pub const HEALTH_UPDATED: &str = "health-updated";
pub const HEALTH_CHANGED: &str = "health-changed";
pub const LOG_CREATED: &str = "log-created";
pub const LOGS_CLEARED: &str = "logs-cleared";
pub const CADDY_STATUS_CHANGED: &str = "caddy-status-changed";

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Listener};

    #[test]
    fn tauri_accepts_and_delivers_every_application_event() {
        let app = tauri::test::mock_app();
        let names = [
            ENVIRONMENT_SWITCHED,
            PROXY_RESTARTED,
            CONFIG_CHANGED,
            HEALTH_UPDATED,
            HEALTH_CHANGED,
            LOG_CREATED,
            LOGS_CLEARED,
            CADDY_STATUS_CHANGED,
        ];
        let received = Arc::new(Mutex::new(Vec::new()));
        for (index, name) in names.into_iter().enumerate() {
            let sink = received.clone();
            let listener = app.listen(name, move |event| {
                sink.lock()
                    .unwrap()
                    .push(serde_json::from_str::<usize>(event.payload()).unwrap());
            });
            app.emit(name, index).unwrap();
            app.unlisten(listener);
        }
        assert_eq!(
            *received.lock().unwrap(),
            (0..names.len()).collect::<Vec<_>>()
        );
        assert!(
            app.emit("config.changed", ()).is_err(),
            "the old dotted name must reproduce Tauri's validation failure"
        );
    }
}
