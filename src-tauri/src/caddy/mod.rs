mod client;
pub(crate) mod generator;
mod manager;

pub use client::Client;
pub use generator::generate_caddy_config;
pub use manager::Manager;
