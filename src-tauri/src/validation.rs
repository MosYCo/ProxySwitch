use crate::model::{Environment, Project};
use anyhow::{bail, Result};
use std::net::ToSocketAddrs;

pub fn validate_project(project: &Project) -> Result<()> {
    validate_name("project name", &project.name)?;
    validate_listen(&project.listen)?;

    for (env_name, env) in &project.environments {
        validate_name("environment name", env_name)?;
        validate_environment(env)
            .map_err(|e| anyhow::anyhow!("environment {:?}: {}", env_name, e))?;
    }

    if !project.current.is_empty() {
        if !project.environments.contains_key(&project.current) {
            bail!("current environment {:?} does not exist", project.current);
        }
    }

    Ok(())
}

pub fn validate_environment(env: &Environment) -> Result<()> {
    validate_backend_addr(&env.addr)
}

pub fn validate_name(label: &str, value: &str) -> Result<()> {
    let value = value.trim();
    if value.is_empty() {
        bail!("{} cannot be empty", label);
    }
    if value.contains('/')
        || value.contains('?')
        || value.contains('#')
        || value.contains(char::is_whitespace)
    {
        bail!(
            "{} cannot contain slash, whitespace, query, or fragment characters",
            label
        );
    }
    Ok(())
}

pub fn validate_listen(listen: &str) -> Result<()> {
    let listen = listen.trim();
    if listen.is_empty() {
        bail!("listen cannot be empty");
    }
    if !listen.starts_with(':') {
        bail!("listen must be in :port form");
    }
    let port_str = &listen[1..];
    let port: u16 = port_str
        .parse()
        .map_err(|_| anyhow::anyhow!("listen must contain a valid port (1-65535)"))?;
    if port == 0 {
        bail!("listen port must be between 1 and 65535");
    }
    Ok(())
}

pub fn validate_backend_addr(addr: &str) -> Result<()> {
    let addr = addr.trim();
    if addr.is_empty() {
        bail!("addr cannot be empty");
    }

    if addr.starts_with("http://") || addr.starts_with("https://") {
        // Parse as URL
        let url = url::Url::parse(addr).map_err(|_| anyhow::anyhow!("addr must be a valid URL"))?;
        if url.host_str().is_none() || url.host_str().unwrap().is_empty() {
            bail!("addr must have a valid host");
        }
        if url.scheme() != "http" && url.scheme() != "https" {
            bail!("addr scheme must be http or https");
        }
        if let Some(port) = url.port() {
            validate_port(port)?;
        }
        return Ok(());
    }

    // Parse as host:port
    match addr.to_socket_addrs() {
        Ok(mut addrs) => {
            if addrs.next().is_none() {
                bail!("addr must resolve to a valid address");
            }
        }
        Err(_) => {
            // Try splitting manually
            let parts: Vec<&str> = addr.splitn(2, ':').collect();
            if parts.len() != 2 || parts[0].is_empty() {
                bail!("addr must be a valid URL or host:port");
            }
            let port: u16 = parts[1]
                .parse()
                .map_err(|_| anyhow::anyhow!("addr port must be valid"))?;
            validate_port(port)?;
        }
    }

    Ok(())
}

fn validate_port(port: u16) -> Result<()> {
    if port == 0 {
        bail!("addr port must be between 1 and 65535");
    }
    Ok(())
}
