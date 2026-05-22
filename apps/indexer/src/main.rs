use anyhow::Result;
use axum::{routing::get, Router};
use soltap_indexer::{
    config,
    events::HandshakeEvent,
    http::{self, AppState},
    store::Store,
    subscriber::{PollingSubscriber, Subscriber},
};
use std::{net::SocketAddr, sync::Arc};
use tokio::sync::broadcast;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let cfg = config::load()?;
    tracing::info!(
        cluster = %cfg.chain.cluster,
        collection = %cfg.collection.collection_address,
        "loaded config"
    );

    let db_url =
        std::env::var("INDEXER_DB_URL").unwrap_or_else(|_| "sqlite:./soltap.db".into());
    let store = Store::open(&db_url).await?;
    let initial = store.count().await?;
    tracing::info!(db = %db_url, count = initial, "store opened");

    let (tx, _) = broadcast::channel::<HandshakeEvent>(64);

    {
        let sub = PollingSubscriber::new(
            cfg.chain.rpc_url.clone(),
            cfg.collection.collection_address.clone(),
        );
        let store_for_sub = store.clone();
        let tx_for_sub = tx.clone();
        tokio::spawn(async move {
            if let Err(e) = sub.run(store_for_sub, tx_for_sub).await {
                tracing::error!(error = ?e, "subscriber crashed");
            }
        });
    }

    let state = AppState {
        store: Arc::new(store),
        tx,
    };

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .merge(http::router(state))
        .layer(CorsLayer::permissive())
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
