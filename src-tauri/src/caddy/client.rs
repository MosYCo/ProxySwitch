use crate::model::Config;
use anyhow::{Context, Result};
use reqwest::Client as HttpClient;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
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
                .redirect(reqwest::redirect::Policy::none())
                .no_proxy()
                // Keep the localhost Host header expected by Caddy, but avoid DNS
                // and prefer IPv4, as Go normally binds localhost to IPv4 on Windows.
                // An IPv6-only listener remains reachable through the second address.
                .resolve_to_addrs(
                    "localhost",
                    &[
                        SocketAddr::new(Ipv4Addr::LOCALHOST.into(), 0),
                        SocketAddr::new(Ipv6Addr::LOCALHOST.into(), 0),
                    ],
                )
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to create HTTP client"),
        }
    }

    pub async fn load_config(&self, config: &Config) -> Result<()> {
        let caddy_config = super::generate_caddy_config(config);
        self.load_json_config(&caddy_config).await
    }

    pub async fn load_json_config(&self, config: &serde_json::Value) -> Result<()> {
        self.post_config(&self.admin_url(), config).await
    }

    async fn post_config(&self, admin_url: &str, config: &serde_json::Value) -> Result<()> {
        let url = format!("{}/load", admin_url);
        let resp = self
            .http
            .post(&url)
            .json(config)
            .send()
            .await
            .with_context(|| format!("failed to send request to Caddy at {}", url))?;

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
            .with_context(|| format!("failed to reach Caddy at {}", url))?;

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
            .with_context(|| format!("Caddy not reachable at {}", url))?;

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
    } else if url.starts_with(':') {
        format!("http://127.0.0.1{}", url.trim_end_matches('/'))
    } else if url.starts_with("0.0.0.0:") {
        format!("http://127.0.0.1:{}", url.trim_start_matches("0.0.0.0:"))
    } else if url.starts_with("[::]:") {
        format!("http://[::1]:{}", url.trim_start_matches("[::]:"))
    } else {
        format!("http://{}", url.trim_end_matches('/'))
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_admin_url;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn localhost_admin_keeps_host_header_on_ipv4_and_ipv6() {
        for bind in ["127.0.0.1:0", "[::1]:0"] {
            let listener = match tokio::net::TcpListener::bind(bind).await {
                Ok(listener) => listener,
                Err(error) if bind == "[::1]:0" => {
                    eprintln!("IPv6 loopback unavailable: {}", error);
                    continue;
                }
                Err(error) => panic!("{}", error),
            };
            let admin = format!("localhost:{}", listener.local_addr().unwrap().port());
            let expected_host = admin.clone();
            let task = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                loop {
                    let mut chunk = [0u8; 1024];
                    let size = stream.read(&mut chunk).await.unwrap();
                    assert!(size > 0);
                    request.extend_from_slice(&chunk[..size]);
                    if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8(request).unwrap().to_lowercase();
                assert!(request.starts_with("get /config/ http/1.1\r\n"));
                assert!(request
                    .lines()
                    .any(|line| line == format!("host: {}", expected_host)));
                stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                    )
                    .await
                    .unwrap();
            });
            let result = super::Client::new(&admin).get_config().await;
            if result.is_err() {
                task.abort();
            }
            assert_eq!(result.unwrap(), serde_json::json!({}));
            task.await.unwrap();
        }
    }

    #[test]
    fn normalizes_admin_urls() {
        assert_eq!(
            normalize_admin_url("localhost:2019"),
            "http://localhost:2019"
        );
        assert_eq!(
            normalize_admin_url("http://localhost:2019/"),
            "http://localhost:2019"
        );
        assert_eq!(normalize_admin_url(""), "http://localhost:2019");
    }
}
