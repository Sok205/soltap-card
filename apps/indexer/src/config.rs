use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use std::{
    env, fs,
    path::PathBuf,
};

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Config {
    pub owner: Owner,
    pub chain: Chain,
    pub collection: Collection,
    pub event: Event,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Owner {
    pub name: String,
    pub wallet: String,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Chain {
    pub cluster: String,
    pub rpc_url: String,
    pub helius_laserstream_url: Option<String>,
    #[serde(default)]
    pub sponsor_fees: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Collection {
    pub collection_address: String,
    pub owner_card_asset: String,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Event {
    pub name: String,
}

/// Walk upward from cwd up to `max_depth` parents looking for `target`.
fn find_upward(target: &str, max_depth: usize) -> Option<PathBuf> {
    let mut dir: PathBuf = env::current_dir().ok()?;
    for _ in 0..max_depth {
        let candidate = dir.join(target);
        if candidate.exists() {
            return Some(candidate);
        }
        if !dir.pop() {
            return None;
        }
    }
    None
}

fn expand_env(s: &str) -> Result<String> {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            let close = bytes[i + 2..]
                .iter()
                .position(|b| *b == b'}')
                .ok_or_else(|| anyhow!("unterminated ${{...}} in config"))?;
            let name = std::str::from_utf8(&bytes[i + 2..i + 2 + close])?;
            let val = env::var(name)
                .with_context(|| format!("env var {name} not set (referenced in config.toml)"))?;
            out.push_str(&val);
            i += 2 + close + 1;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    Ok(out)
}

pub fn load() -> Result<Config> {
    // 1. Load .env from repo root (best-effort — skip silently if absent)
    if let Some(env_path) = find_upward(".env", 6) {
        dotenvy::from_path(&env_path).ok();
    }

    // 2. Find config.toml
    let cfg_path = find_upward("config.toml", 6)
        .ok_or_else(|| anyhow!("config.toml not found (searched up to 6 parents of cwd)"))?;
    let raw = fs::read_to_string(&cfg_path)
        .with_context(|| format!("reading {}", cfg_path.display()))?;
    let mut cfg: Config = toml::from_str(&raw).context("parsing config.toml")?;

    // 3. Expand env vars in rpc_url
    cfg.chain.rpc_url = expand_env(&cfg.chain.rpc_url)?;

    // 4. Validate
    if cfg.collection.collection_address.is_empty() {
        bail!("config.toml: collection.collection_address is empty (run init-collection first)");
    }
    if cfg.collection.owner_card_asset.is_empty() {
        bail!("config.toml: collection.owner_card_asset is empty (run init-collection first)");
    }
    Ok(cfg)
}

/// Resolves the config.toml path without parsing it (useful for diagnostics).
#[allow(dead_code)]
pub fn config_path() -> Option<PathBuf> {
    find_upward("config.toml", 6)
}
