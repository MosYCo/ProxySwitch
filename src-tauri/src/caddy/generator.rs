use crate::model::{Config, Project};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub fn generate_caddy_config(config: &Config) -> Value {
    let mut groups: BTreeMap<String, Vec<&Project>> = BTreeMap::new();
    for project in config.projects.values() {
        // Disabled and empty projects do not open ports or add routes.
        if project.has_proxy_route() {
            groups
                .entry(project.listen.clone())
                .or_default()
                .push(project);
        }
    }
    let mut servers = serde_json::Map::new();
    for (index, (listen, mut projects)) in groups.into_iter().enumerate() {
        // More specific routes win when custom prefixes are nested.
        projects.sort_by(|a, b| {
            b.route_path()
                .map_or(0, |p| p.len())
                .cmp(&a.route_path().map_or(0, |p| p.len()))
                .then_with(|| a.name.cmp(&b.name))
        });
        let routes: Vec<_> = projects
            .into_iter()
            .filter_map(|project| generate_project_route(project, config))
            .collect();
        servers.insert(
            format!("proxy_{}", index),
            json!({
                "listen": [listen], "routes": routes, "automatic_https": {"disable": true},
                "logs": {}, "protocols": ["h1"]
            }),
        );
    }
    json!({
        "admin": {"listen": config.caddy_admin}, "apps": {"http": {"servers": servers}},
        "logging": {"logs": {
            "default": {"level": config.settings.logs.caddy_level, "exclude": ["http.log.access"]},
            "requests": {"level": "INFO", "include": ["http.log.access"], "writer": {"output": if config.settings.logs.requests_enabled { "stderr" } else { "discard" }}}
        }}
    })
}

fn generate_project_route(project: &Project, config: &Config) -> Option<Value> {
    let env = project.environments.get(&project.current)?;
    let options = config
        .settings
        .proxy
        .with_override(&project.proxy)
        .with_override(&env.proxy);
    let prefix = project.route_path();
    let (dial, scheme, base_path, host) = parse_backend_addr(&env.addr);
    let mut handlers = vec![
        json!({"handler": "log_append", "key": "cpt_metadata_encoding", "value": "url"}),
        json!({"handler": "log_append", "key": "cpt_project", "value": log_literal(&project.name)}),
        json!({"handler": "log_append", "key": "cpt_environment", "value": log_literal(&project.current)}),
        json!({"handler": "log_append", "key": "cpt_backend", "value": log_literal(&env.addr)}),
        json!({"handler": "log_append", "key": "cpt_original_uri", "value": "{http.request.orig_uri}"}),
    ];
    if let Some(prefix) = prefix
        .as_ref()
        .filter(|_| project.strip_prefix || project.rewrite_prefix.is_some())
    {
        handlers.push(json!({"handler": "rewrite", "strip_path_prefix": prefix}));
    }
    if let Some(path) = &project.rewrite_prefix {
        let path = path.trim_end_matches('/');
        if !path.is_empty() {
            handlers.push(
                json!({"handler": "rewrite", "uri": format!("{}{{http.request.uri}}", path)}),
            );
        }
    }
    if !base_path.is_empty() {
        handlers.push(
            json!({"handler": "rewrite", "uri": format!("{}{{http.request.uri}}", base_path)}),
        );
    }
    let mut headers = json!({"Host": [options.host.as_ref().unwrap_or(&host)]});
    if let Some(prefix) = &prefix {
        headers["X-Forwarded-Prefix"] = json!([prefix]);
    }
    let mut proxy = json!({
        "handler": "reverse_proxy", "upstreams": [{"dial": dial}],
        "headers": {"request": {"set": headers}}
    });
    let mut transport = json!({"protocol": "http"});
    if scheme == "https" {
        transport["tls"] = if env.insecure_skip_verify {
            json!({"insecure_skip_verify": true})
        } else {
            json!({})
        };
    }
    if let Some(ms) = options.connect_timeout_ms {
        transport["dial_timeout"] = json!(format!("{}ms", ms));
    }
    if let Some(ms) = options.response_timeout_ms {
        transport["response_header_timeout"] = json!(format!("{}ms", ms));
    }
    proxy["transport"] = transport;
    for (direction, rules) in [
        ("request", &options.request_headers),
        ("response", &options.response_headers),
    ] {
        let mut remove = Vec::new();
        for (name, value) in rules {
            if let Some(value) = value {
                proxy["headers"][direction]["set"][name] = json!([value]);
            } else {
                remove.push(name);
            }
        }
        if !remove.is_empty() {
            proxy["headers"][direction]["delete"] = json!(remove);
        }
    }
    handlers.push(proxy);
    let mut route = json!({"handle": handlers, "terminal": true});
    if let Some(prefix) = prefix {
        route["match"] = json!([{"path": [prefix, format!("{}/*", prefix)]}]);
    }
    Some(route)
}

fn parse_backend_addr(addr: &str) -> (String, String, String, String) {
    let candidate = if addr.starts_with("http://") || addr.starts_with("https://") {
        addr.to_string()
    } else {
        format!("http://{}", addr)
    };
    match url::Url::parse(&candidate) {
        Ok(url) => {
            let scheme = url.scheme().to_string();
            let hostname = match url.host() {
                Some(url::Host::Ipv6(ip)) => format!("[{}]", ip),
                Some(host) => host.to_string(),
                None => "localhost".to_string(),
            };
            let port = url.port_or_known_default().unwrap_or(80);
            let host = url
                .port()
                .map(|p| format!("{}:{}", hostname, p))
                .unwrap_or_else(|| hostname.clone());
            let base = url
                .path()
                .trim_end_matches('/')
                .replace('{', "%7B")
                .replace('}', "%7D");
            (format!("{}:{}", hostname, port), scheme, base, host)
        }
        Err(_) => (
            addr.to_string(),
            "http".to_string(),
            String::new(),
            addr.to_string(),
        ),
    }
}

fn log_literal(value: &str) -> String {
    // log_append expands placeholders in string values. Encode configuration
    // text so braces in names or URLs remain literal rather than request data.
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::model::Environment;
    use std::collections::HashMap;
    pub fn project(name: &str, prefix: bool, address: &str) -> Project {
        Project {
            proxy: Default::default(),
            health: Default::default(),
            route_prefix: None,
            rewrite_prefix: None,
            name: name.into(),
            listen: ":8080".into(),
            enabled: true,
            path_prefix: prefix,
            strip_prefix: prefix,
            desc: String::new(),
            current: "dev".into(),
            environments: HashMap::from([(
                "dev".into(),
                Environment {
                    proxy: Default::default(),
                    health: Default::default(),
                    addr: address.into(),
                    desc: String::new(),
                    insecure_skip_verify: false,
                },
            )]),
        }
    }
    fn config(projects: Vec<Project>) -> Config {
        Config {
            projects: projects.into_iter().map(|p| (p.name.clone(), p)).collect(),
            ..Config::default()
        }
    }
    #[test]
    fn empty_config_does_not_open_an_unrequested_port() {
        let output = generate_caddy_config(&Config::default());
        assert_eq!(output["apps"]["http"]["servers"], json!({}));
    }
    #[test]
    fn adding_empty_project_does_not_change_existing_route() {
        let mut config = config(vec![project("one", false, "http://localhost:3000")]);
        let before = generate_caddy_config(&config);
        let mut empty = project("two", true, "http://localhost:3001");
        empty.environments.clear();
        empty.current.clear();
        config.projects.insert(empty.name.clone(), empty);
        assert_eq!(before, generate_caddy_config(&config));
    }
    #[test]
    fn disabled_projects_do_not_open_ports_or_change_other_routes() {
        let mut config = config(vec![project("one", false, "http://localhost:3000")]);
        let before = generate_caddy_config(&config);
        let mut paused = project("paused", false, "http://localhost:3001");
        paused.enabled = false;
        config.projects.insert(paused.name.clone(), paused);
        assert_eq!(generate_caddy_config(&config), before);
        config.projects.get_mut("one").unwrap().enabled = false;
        assert_eq!(
            generate_caddy_config(&config)["apps"]["http"]["servers"],
            json!({})
        );
    }
    #[test]
    fn explicit_prefix_is_stable_even_with_one_project() {
        let output =
            generate_caddy_config(&config(vec![project("one", true, "http://localhost:3000")]));
        let route = &output["apps"]["http"]["servers"]["proxy_0"]["routes"][0];
        assert_eq!(route["match"][0]["path"], json!(["/one", "/one/*"]));
        assert!(route["match"][0].get("host").is_none());
        let rewrite = route["handle"]
            .as_array()
            .unwrap()
            .iter()
            .find(|handler| handler["handler"] == "rewrite")
            .unwrap();
        assert_eq!(rewrite["strip_path_prefix"], "/one");
    }
    #[test]
    fn base_path_and_project_prefix_are_composed_before_proxying() {
        let output = generate_caddy_config(&config(vec![project(
            "one",
            true,
            "https://example.com:8443/api/v2/",
        )]));
        let handlers = &output["apps"]["http"]["servers"]["proxy_0"]["routes"][0]["handle"];
        let handlers = handlers.as_array().unwrap();
        let rewrites: Vec<_> = handlers
            .iter()
            .filter(|handler| handler["handler"] == "rewrite")
            .collect();
        let proxy = handlers.last().unwrap();
        assert_eq!(rewrites[0]["strip_path_prefix"], "/one");
        assert_eq!(rewrites[1]["uri"], "/api/v2{http.request.uri}");
        assert_eq!(proxy["upstreams"][0]["dial"], "example.com:8443");
        assert_eq!(
            proxy["headers"]["request"]["set"]["Host"],
            json!(["example.com:8443"])
        );
        assert_eq!(proxy["transport"]["tls"], json!({}));
    }
    #[test]
    fn addresses_preserve_ipv6_and_ports() {
        let (dial, scheme, base, _) = parse_backend_addr("https://[::1]:8443/base/");
        assert_eq!(
            (dial.as_str(), scheme.as_str(), base.as_str()),
            ("[::1]:8443", "https", "/base")
        );
        assert_eq!(parse_backend_addr("10.0.1.1:8080").0, "10.0.1.1:8080");
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::test_support::{server, Directory, Process};
    use std::process::{Command, Stdio};
    #[tokio::test]
    async fn real_caddy_preserves_queries_and_composes_shared_routes_with_base_paths() {
        let target = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => "caddy-x86_64-pc-windows-msvc.exe",
            ("linux", "x86_64") => "caddy-x86_64-unknown-linux-gnu",
            ("macos", "aarch64") => "caddy-aarch64-apple-darwin",
            ("macos", "x86_64") => "caddy-x86_64-apple-darwin",
            _ => return,
        };
        let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(target);
        if !binary.exists() {
            eprintln!("Caddy sidecar absent; run pnpm download-caddy to enable integration test");
            return;
        }
        let backend = server(|request| (200, json!({"path": request.path}))).await;
        fn port() -> u16 {
            std::net::TcpListener::bind("127.0.0.1:0")
                .unwrap()
                .local_addr()
                .unwrap()
                .port()
        }
        let admin_port = port();
        let mut proxy_port = port();
        while proxy_port == admin_port {
            proxy_port = port();
        }
        let mut one = tests::project("one", true, &format!("http://{}/api/v2/", backend.address));
        one.listen = format!(":{}", proxy_port);
        let mut two = tests::project("two", true, &format!("http://{}/other", backend.address));
        two.listen = one.listen.clone();
        let mut config = Config {
            caddy_admin: format!("127.0.0.1:{}", admin_port),
            projects: std::collections::HashMap::from([("one".into(), one), ("two".into(), two)]),
            ..Config::default()
        };
        let directory = Directory::new();
        let file = directory.0.join("caddy.json");
        std::fs::write(
            &file,
            serde_json::to_vec(&generate_caddy_config(&config)).unwrap(),
        )
        .unwrap();
        let log = directory.0.join("caddy.log");
        let mut child = Process(
            Command::new(binary)
                .args(["run", "--config"])
                .arg(&file)
                .env("APPDATA", &directory.0)
                .env("XDG_CONFIG_HOME", &directory.0)
                .env("XDG_DATA_HOME", &directory.0)
                .stdout(Stdio::null())
                .stderr(std::fs::File::create(&log).unwrap())
                .spawn()
                .unwrap(),
        );
        let client = crate::caddy::Client::new(&config.caddy_admin);
        let mut ready = false;
        for _ in 0..100 {
            if child.0.try_wait().unwrap().is_some() {
                break;
            }
            if client.health_check().await.is_ok() {
                ready = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        assert!(
            ready,
            "{}",
            std::fs::read_to_string(&log).unwrap_or_default()
        );
        // Each assertion checks the new configuration, without reusing an idle
        // connection from the server instance that was just drained on reload.
        let http = reqwest::Client::builder()
            .no_proxy()
            .pool_max_idle_per_host(0)
            .build()
            .unwrap();
        for (request, expected) in [
            ("/one/users?x=1", "/api/v2/users?x=1"),
            ("/two/items?q=hello%20world", "/other/items?q=hello%20world"),
        ] {
            let response: Value = http
                .get(format!("http://127.0.0.1:{}{}", proxy_port, request))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(response["path"], expected);
        }
        let config_path = directory.0.join("app-config.json");
        let mut store = crate::store::Store::new(config_path.to_str().unwrap()).unwrap();
        store.replace_config(config.clone()).unwrap();
        crate::configuration::set_project_enabled(&mut store, &client, "two", false, true)
            .await
            .unwrap();
        let requests_before = backend.requests.lock().unwrap().len();
        http.get(format!("http://127.0.0.1:{}/two/stopped", proxy_port))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(backend.requests.lock().unwrap().len(), requests_before);
        let response: Value = http
            .get(format!("http://127.0.0.1:{}/one/kept-running", proxy_port))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["path"], "/api/v2/kept-running");
        crate::configuration::set_project_enabled(&mut store, &client, "two", true, true)
            .await
            .unwrap();
        let response: Value = http
            .get(format!("http://127.0.0.1:{}/two/resumed", proxy_port))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["path"], "/other/resumed");
        crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::CreateEnvironment(
                "one".into(),
                "stage".into(),
                crate::model::Environment {
                    proxy: Default::default(),
                    health: Default::default(),
                    addr: format!("http://{}/stage-api/", backend.address),
                    desc: String::new(),
                    insecure_skip_verify: false,
                },
            ),
        )
        .await
        .unwrap();
        crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::SwitchEnvironment("one".into(), "stage".into()),
        )
        .await
        .unwrap();
        let response: Value = http
            .get(format!(
                "http://127.0.0.1:{}/one/after-switch?test=2",
                proxy_port
            ))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["path"], "/stage-api/after-switch?test=2");
        config = store.get_config().clone();
        let log_deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            let output = std::fs::read_to_string(&log).unwrap();
            let entries: Vec<Value> = output
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect();
            if let Some(after_switch) = entries
                .iter()
                .find(|entry| entry["cpt_original_uri"] == "/one/after-switch?test=2")
            {
                let first = entries
                    .iter()
                    .find(|entry| entry["cpt_original_uri"] == "/one/users?x=1")
                    .expect("original URI must survive prefix stripping and base path rewriting");
                let second = entries
                    .iter()
                    .find(|entry| entry["cpt_original_uri"] == "/two/items?q=hello%20world")
                    .unwrap();
                assert_eq!(first["cpt_project"], "one");
                assert_eq!(second["cpt_project"], "two");
                assert_eq!(first["cpt_environment"], "dev");
                assert_eq!(after_switch["cpt_environment"], "stage");
                let decode = |entry: &Value| {
                    url::form_urlencoded::parse(
                        format!("value={}", entry["cpt_backend"].as_str().unwrap()).as_bytes(),
                    )
                    .next()
                    .unwrap()
                    .1
                    .into_owned()
                };
                assert_eq!(decode(first), format!("http://{}/api/v2/", backend.address));
                assert_eq!(
                    decode(after_switch),
                    format!("http://{}/stage-api/", backend.address)
                );
                break;
            }
            assert!(
                tokio::time::Instant::now() < log_deadline,
                "request routing metadata was not logged:\n{}",
                output
            );
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        config.projects.remove("two");
        client.load_config(&config).await.unwrap();
        let response: Value = http
            .get(format!("http://127.0.0.1:{}/one/still-works", proxy_port))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["path"], "/stage-api/still-works");

        let before_advanced = config.clone();
        let advanced_backend = server(|request| {
            if request.path.contains("/slow") {
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            (
                200,
                json!({"path": request.path, "headers": request.headers}),
            )
        })
        .await;
        config.settings.logs.caddy_level = "WARN".into();
        config.settings.proxy.connect_timeout_ms = Some(3000);
        config
            .settings
            .proxy
            .request_headers
            .insert("X-Inherit".into(), Some("global".into()));
        config
            .settings
            .proxy
            .request_headers
            .insert("X-Mode".into(), Some("global".into()));
        config
            .settings
            .proxy
            .response_headers
            .insert("X-Reply".into(), Some("global".into()));
        let advanced = config.projects.get_mut("one").unwrap();
        advanced.route_prefix = Some("/api".into());
        advanced.rewrite_prefix = Some("/v2".into());
        advanced
            .proxy
            .request_headers
            .insert("X-Mode".into(), Some("project".into()));
        let stage = advanced.environments.get_mut("stage").unwrap();
        stage.addr = format!("http://{}/base", advanced_backend.address);
        stage.proxy.response_timeout_ms = Some(40);
        stage.proxy.host = Some("api.example.test".into());
        stage
            .proxy
            .request_headers
            .insert("x-mode".into(), Some("environment".into()));
        stage.proxy.request_headers.insert("x-delete".into(), None);
        stage
            .proxy
            .response_headers
            .insert("x-reply".into(), Some("environment".into()));
        client.load_config(&config).await.unwrap();
        let response = http
            .get(format!("http://127.0.0.1:{}/api/users?keep=1", proxy_port))
            .header("X-Delete", "client")
            .send()
            .await
            .unwrap();
        assert_eq!(response.headers()["x-reply"], "environment");
        let body: Value = response.json().await.unwrap();
        assert_eq!(body["path"], "/base/v2/users?keep=1");
        assert_eq!(body["headers"]["host"], "api.example.test");
        assert_eq!(body["headers"]["x-inherit"], "global");
        assert_eq!(body["headers"]["x-mode"], "environment");
        assert!(body["headers"].get("x-delete").is_none());
        assert_eq!(
            http.get(format!("http://127.0.0.1:{}/api/slow", proxy_port))
                .send()
                .await
                .unwrap()
                .status(),
            504
        );
        // Request logging remains enabled independently of the WARN engine level.
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        assert!(std::fs::read_to_string(&log)
            .unwrap()
            .contains("/api/users?keep=1"));
        config.settings.logs.requests_enabled = false;
        client.load_config(&config).await.unwrap();
        http.get(format!(
            "http://127.0.0.1:{}/api/no-access-record",
            proxy_port
        ))
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        assert!(!std::fs::read_to_string(&log)
            .unwrap()
            .contains("no-access-record"));
        config = before_advanced;
        client.load_config(&config).await.unwrap();

        store.replace_config(config.clone()).unwrap();
        assert!(crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::SetAdmin(backend.address.clone())
        )
        .await
        .is_err());
        assert_eq!(
            store.get_project("one").unwrap().listen,
            format!(":{}", proxy_port)
        );
        assert!(client.health_check().await.is_ok());

        crate::configuration::set_project_enabled(&mut store, &client, "one", false, true)
            .await
            .unwrap();
        assert_eq!(
            client.get_config().await.unwrap()["apps"]["http"]["servers"],
            json!({})
        );
        // A fresh TCP connection must fail when the final project stops.
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", proxy_port))
            .await
            .is_err());
        let blocked = crate::test_support::occupied_port();
        let blocked_port = blocked.local_addr().unwrap().port();
        let mut edited = store.get_project("one").unwrap().clone();
        edited.listen = format!(":{}", blocked_port);
        crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::UpdateProject("one".into(), edited),
        )
        .await
        .unwrap();
        let before = std::fs::read(&config_path).unwrap();
        assert!(
            crate::configuration::set_project_enabled(&mut store, &client, "one", true, true)
                .await
                .is_err()
        );
        assert!(!store.get_project("one").unwrap().enabled);
        assert_eq!(std::fs::read(&config_path).unwrap(), before);
        assert!(client.health_check().await.is_ok());
        drop(blocked);
        let mut edited = store.get_project("one").unwrap().clone();
        edited.listen = format!(":{}", proxy_port);
        crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::UpdateProject("one".into(), edited),
        )
        .await
        .unwrap();
        crate::configuration::set_project_enabled(&mut store, &client, "one", true, true)
            .await
            .unwrap();
        let response: Value = http
            .get(format!("http://127.0.0.1:{}/one/resumed", proxy_port))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["path"], "/stage-api/resumed");

        let old_admin = config.caddy_admin.clone();
        let new_admin = format!("127.0.0.1:{}", port());
        crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::SetAdmin(new_admin.clone()),
        )
        .await
        .unwrap();
        assert_eq!(store.get_config().caddy_admin, new_admin);
        assert!(client.health_check().await.is_ok());
        // A failed disk save while moving admin must restore the prior admin as well.
        std::fs::remove_file(&config_path).unwrap();
        std::fs::create_dir(&config_path).unwrap();
        let error = crate::configuration::commit_change(
            &mut store,
            &client,
            crate::configuration::Change::SetAdmin(old_admin),
        )
        .await
        .unwrap_err();
        assert!(error.to_string().contains("已恢复原配置"), "{:#}", error);
        assert_eq!(store.get_config().caddy_admin, new_admin);
        assert!(client.health_check().await.is_ok());
    }
}
