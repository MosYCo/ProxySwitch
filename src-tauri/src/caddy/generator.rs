use crate::model::{Config, Project};
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// Generate a full Caddy JSON configuration from the app config.
pub fn generate_caddy_config(config: &Config) -> Value {
    // Group projects by listen address
    let mut projects_by_listen: BTreeMap<String, Vec<&Project>> = BTreeMap::new();

    for project in config.projects.values() {
        if project.listen.is_empty() {
            continue;
        }
        projects_by_listen
            .entry(project.listen.clone())
            .or_default()
            .push(project);
    }

    // Sort projects within each listen group by name
    for projects in projects_by_listen.values_mut() {
        projects.sort_by(|a, b| a.name.cmp(&b.name));
    }

    // Generate servers
    let mut servers = serde_json::Map::new();

    for (i, (listen, projects)) in projects_by_listen.iter().enumerate() {
        let mut routes = Vec::new();

        let use_path_prefix = projects.len() > 1;

        for project in projects {
            if let Some(route) = generate_project_route(project, use_path_prefix) {
                routes.push(route);
            }
        }

        let server = json!({
            "listen": [listen],
            "routes": routes,
            "automatic_https": {
                "disable": true
            }
        });

        servers.insert(format!("proxy_{}", i), server);
    }

    // If no servers, create an empty default
    if servers.is_empty() {
        servers.insert(
            "proxy".to_string(),
            json!({
                "listen": [":3000"],
                "routes": [],
                "automatic_https": {
                    "disable": true
                }
            }),
        );
    }

    json!({
        "admin": {
            "listen": config.caddy_admin
        },
        "apps": {
            "http": {
                "servers": servers
            }
        }
    })
}

/// Generate a Caddy route for a single project.
fn generate_project_route(project: &Project, use_path_prefix: bool) -> Option<Value> {
    let env = project.environments.get(&project.current)?;

    let (dial, scheme) = parse_backend_addr(&env.addr);
    let host = backend_host(&env.addr);

    // Build headers
    let mut headers = serde_json::Map::new();
    let mut set_headers = serde_json::Map::new();

    if !host.is_empty() {
        set_headers.insert("Host".to_string(), json!([host]));
    }

    if use_path_prefix {
        set_headers.insert(
            "X-Forwarded-Prefix".to_string(),
            json!([format!("/{}", project.name)]),
        );
    }

    headers.insert("set".to_string(), Value::Object(set_headers));

    // Build handler
    let mut handler = json!({
        "handler": "reverse_proxy",
        "upstreams": [{"dial": dial}],
        "headers": {
            "request": headers
        }
    });

    // Add TLS transport for HTTPS backends
    if scheme == "https" {
        let tls = if env.insecure_skip_verify {
            json!({ "insecure_skip_verify": true })
        } else {
            json!({})
        };

        handler["transport"] = json!({
            "protocol": "http",
            "tls": tls
        });
    }

    let mut route = json!({
        "handle": [handler],
        "terminal": true
    });

    if use_path_prefix {
        route["match"] = json!([{
            "host": ["localhost"],
            "path": [format!("/{}/*", project.name)]
        }]);
    }

    Some(route)
}

/// Parse a backend address into (dial, scheme).
fn parse_backend_addr(addr: &str) -> (String, String) {
    if !addr.starts_with("http://") && !addr.starts_with("https://") {
        return (addr.to_string(), "http".to_string());
    }

    match url::Url::parse(addr) {
        Ok(u) => {
            let scheme = u.scheme().to_string();
            let host = u.host_str().unwrap_or("localhost");
            let port = u.port().unwrap_or(if scheme == "https" { 443 } else { 80 });
            (format!("{}:{}", host, port), scheme)
        }
        Err(_) => (addr.to_string(), "http".to_string()),
    }
}

/// Extract the hostname from a backend address.
fn backend_host(addr: &str) -> String {
    if !addr.starts_with("http://") && !addr.starts_with("https://") {
        return addr.split(':').next().unwrap_or(addr).to_string();
    }

    url::Url::parse(addr)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_generate_empty_config() {
        let config = Config::default();
        let result = generate_caddy_config(&config);
        assert!(result["apps"]["http"]["servers"]["proxy"]["routes"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(
            result["apps"]["http"]["servers"]["proxy"]["automatic_https"]["disable"],
            true
        );
        assert!(result["apps"]["http"].get("automatic_https").is_none());
    }

    #[test]
    fn test_generate_single_project() {
        let mut envs = HashMap::new();
        envs.insert(
            "prod".to_string(),
            crate::model::Environment {
                addr: "https://api.example.com".to_string(),
                desc: "Production".to_string(),
                insecure_skip_verify: true,
            },
        );

        let mut projects = HashMap::new();
        projects.insert(
            "myapp".to_string(),
            Project {
                name: "myapp".to_string(),
                listen: ":8080".to_string(),
                desc: "My App".to_string(),
                environments: envs,
                current: "prod".to_string(),
            },
        );

        let config = Config {
            caddy_admin: "localhost:2019".to_string(),
            projects,
        };

        let result = generate_caddy_config(&config);
        let servers = result["apps"]["http"]["servers"].as_object().unwrap();
        assert!(servers.contains_key("proxy_0"));
        assert_eq!(servers["proxy_0"]["automatic_https"]["disable"], true);

        let routes = servers["proxy_0"]["routes"].as_array().unwrap();
        assert_eq!(routes.len(), 1);

        // Single-project ports are transparent proxies for local dev server targets.
        assert!(routes[0].get("match").is_none());
        assert!(routes[0]["handle"][0]["headers"]["request"]["set"]
            .get("X-Forwarded-Prefix")
            .is_none());
    }

    #[test]
    fn test_generate_shared_port_uses_project_prefix() {
        let mut first_envs = HashMap::new();
        first_envs.insert(
            "prod".to_string(),
            crate::model::Environment {
                addr: "https://api-one.example.com".to_string(),
                desc: "Production".to_string(),
                insecure_skip_verify: true,
            },
        );

        let mut second_envs = HashMap::new();
        second_envs.insert(
            "prod".to_string(),
            crate::model::Environment {
                addr: "https://api-two.example.com".to_string(),
                desc: "Production".to_string(),
                insecure_skip_verify: true,
            },
        );

        let mut projects = HashMap::new();
        projects.insert(
            "one".to_string(),
            Project {
                name: "one".to_string(),
                listen: ":8080".to_string(),
                desc: "One".to_string(),
                environments: first_envs,
                current: "prod".to_string(),
            },
        );
        projects.insert(
            "two".to_string(),
            Project {
                name: "two".to_string(),
                listen: ":8080".to_string(),
                desc: "Two".to_string(),
                environments: second_envs,
                current: "prod".to_string(),
            },
        );

        let config = Config {
            caddy_admin: "localhost:2019".to_string(),
            projects,
        };

        let result = generate_caddy_config(&config);
        let routes = result["apps"]["http"]["servers"]["proxy_0"]["routes"]
            .as_array()
            .unwrap();

        assert_eq!(routes.len(), 2);
        assert_eq!(routes[0]["match"][0]["path"], json!(["/one/*"]));
        assert_eq!(
            routes[0]["handle"][0]["headers"]["request"]["set"]["X-Forwarded-Prefix"],
            json!(["/one"])
        );
        assert_eq!(routes[1]["match"][0]["path"], json!(["/two/*"]));
        assert_eq!(
            routes[1]["handle"][0]["headers"]["request"]["set"]["X-Forwarded-Prefix"],
            json!(["/two"])
        );
    }

    #[test]
    fn test_https_backend_can_verify_certificates() {
        let mut envs = HashMap::new();
        envs.insert(
            "prod".to_string(),
            crate::model::Environment {
                addr: "https://api.example.com".to_string(),
                desc: "Production".to_string(),
                insecure_skip_verify: false,
            },
        );

        let mut projects = HashMap::new();
        projects.insert(
            "myapp".to_string(),
            Project {
                name: "myapp".to_string(),
                listen: ":8080".to_string(),
                desc: "My App".to_string(),
                environments: envs,
                current: "prod".to_string(),
            },
        );

        let config = Config {
            caddy_admin: "localhost:2019".to_string(),
            projects,
        };

        let result = generate_caddy_config(&config);
        let transport =
            &result["apps"]["http"]["servers"]["proxy_0"]["routes"][0]["handle"][0]["transport"];

        assert_eq!(transport["tls"], json!({}));
    }

    #[test]
    fn test_parse_backend_addr() {
        let (dial, scheme) = parse_backend_addr("https://api.example.com:8443");
        assert_eq!(dial, "api.example.com:8443");
        assert_eq!(scheme, "https");

        let (dial, scheme) = parse_backend_addr("http://localhost:3000");
        assert_eq!(dial, "localhost:3000");
        assert_eq!(scheme, "http");

        let (dial, scheme) = parse_backend_addr("10.0.1.1:8080");
        assert_eq!(dial, "10.0.1.1:8080");
        assert_eq!(scheme, "http");
    }
}
