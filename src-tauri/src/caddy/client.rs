use crate::model::Config;
use anyhow::Result;
use reqwest::Client as HttpClient;
use std::sync::RwLock;
use std::time::Duration;

pub struct Client {
    admin_url: RwLock<String>,
    http: HttpClient,
}

impl Client {
    pub fn new(admin_url: &str) -> Self {
        let admin_url = normalize_admin_url(admin_url);
        Self {
            admin_url: RwLock::new(admin_url),
            http: HttpClient::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to create HTTP client"),
        }
    }

    pub async fn load_config(&self, config: &Config) -> Result<()> {
        let caddy_config = super::generate_caddy_config(config);
        self.post_config(&self.admin_url(), &caddy_config).await
    }

    pub async fn load_config_via(&self, admin_url: &str, config: &Config) -> Result<()> {
        let caddy_config = super::generate_caddy_config(config);
        self.post_config(&normalize_admin_url(admin_url), &caddy_config)
            .await
    }

    async fn post_config(&self, admin_url: &str, config: &serde_json::Value) -> Result<()> {
        let url = format!("{}/load", admin_url);
        let resp = self
            .http
            .post(&url)
            .json(config)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("failed to send request to Caddy: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Caddy returned error: {}", body);
        }

        Ok(())
    }

    pub async fn get_config(&self) -> Result<serde_json::Value> {
        let url = format!("{}/config/", self.admin_url());
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("failed to reach Caddy: {}", e))?;

        if !resp.status().is_success() {
            anyhow::bail!("Caddy returned status {}", resp.status());
        }

        let config = resp
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("failed to parse Caddy config: {}", e))?;
        Ok(config)
    }

    pub async fn health_check(&self) -> Result<()> {
        let url = format!("{}/config/", self.admin_url());
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Caddy not reachable: {}", e))?;

        if !resp.status().is_success() {
            anyhow::bail!("Caddy returned status {}", resp.status());
        }

        Ok(())
    }

    pub fn set_admin_url(&self, admin_url: &str) {
        let mut current = self.admin_url.write().unwrap();
        *current = normalize_admin_url(admin_url);
    }

    pub fn admin_url(&self) -> String {
        self.admin_url.read().unwrap().clone()
    }
}

fn normalize_admin_url(url: &str) -> String {
    let url = url.trim();
    if url.is_empty() {
        return "http://localhost:2019".to_string();
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        url.trim_end_matches('/').to_string()
    } else {
        format!("http://{}", url.trim_end_matches('/'))
    }
}
