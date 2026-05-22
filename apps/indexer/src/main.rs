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
            let mut backoff = std::time::Duration::from_secs(1);
            loop {
                let sub = sub.clone();
                let store = store_for_sub.clone();
                let tx = tx_for_sub.clone();
                let handle = tokio::spawn(async move { sub.run(store, tx).await });
                match handle.await {
                    Ok(Ok(())) => {
                        tracing::warn!("subscriber exited cleanly; restarting in {:?}", backoff);
                    }
                    Ok(Err(e)) => {
                        tracing::error!(error = ?e, "subscriber returned error; restarting in {:?}", backoff);
                    }
                    Err(join_err) => {
                        tracing::error!(panic = ?join_err, "subscriber TASK PANICKED; restarting in {:?}", backoff);
                    }
                }
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(std::time::Duration::from_secs(60));
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
