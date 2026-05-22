use anyhow::Result;
use axum::{routing::get, Router};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

mod config;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let cfg = config::load()?;
    tracing::info!(
        cluster = %cfg.chain.cluster,
        collection = %cfg.collection.collection_address,
        owner_card = %cfg.collection.owner_card_asset,
        "loaded config"
    );

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("INDEXER_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8787);
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("indexer listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
