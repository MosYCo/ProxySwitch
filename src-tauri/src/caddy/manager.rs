use anyhow::Result;
use std::time::Instant;
use tauri::{AppHandle, Manager as TauriManager};
use tauri_plugin_shell::ShellExt;

pub struct CaddyProcess {
    pid: u32,
    started_at: Instant,
    child: tauri_plugin_shell::SidecarCommandChild,
}

pub struct Manager {
    app: AppHandle,
    process: Option<CaddyProcess>,
}

impl Manager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            process: None,
        }
    }

    pub async fn start(&mut self) -> Result<()> {
        if self.process.is_some() {
            return Ok(());
        }

        let shell = self.app.shell();
        let sidecar = shell
            .sidecar("binaries/caddy")
            .map_err(|e| anyhow::anyhow!("failed to create caddy sidecar: {}", e))?;

        let (mut _rx, child) = sidecar
            .args(["run"])
            .spawn()
            .map_err(|e| anyhow::anyhow!("failed to spawn caddy: {}", e))?;

        // Give Caddy a moment to start
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let pid = child.pid();

        self.process = Some(CaddyProcess {
            pid,
            started_at: Instant::now(),
            child,
        });

        tracing::info!("Caddy started (PID: {})", pid);
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut proc) = self.process.take() {
            // Try graceful stop via caddy stop command
            let shell = self.app.shell();
            if let Ok(stop_cmd) = shell.sidecar("binaries/caddy") {
                if let Ok((rx, _child)) = stop_cmd.args(["stop"]).spawn() {
                    // Wait briefly for graceful stop
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    drop(rx);
                }
            }

            // Kill the process as fallback
            proc.child.kill().ok();
            tracing::info!("Caddy stopped");
        }
        Ok(())
    }

    pub async fn restart(&mut self) -> Result<()> {
        self.stop().await?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        self.start().await
    }

    pub fn is_running(&self) -> bool {
        self.process.is_some()
    }

    pub fn pid(&self) -> u32 {
        self.process.as_ref().map(|p| p.pid).unwrap_or(0)
    }

    pub fn uptime_secs(&self) -> u64 {
        self.process
            .as_ref()
            .map(|p| p.started_at.elapsed().as_secs())
            .unwrap_or(0)
    }

    pub fn managed(&self) -> bool {
        self.process.is_some()
    }
}
