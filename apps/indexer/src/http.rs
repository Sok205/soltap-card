use crate::{events::HandshakeEvent, store::Store};
use axum::{
    extract::{Query, State},
    response::{
        sse::{Event as SseEvent, KeepAlive, Sse},
        IntoResponse,
    },
    routing::get,
    Json, Router,
};
use futures::Stream;
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub tx: broadcast::Sender<HandshakeEvent>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/stats", get(stats))
        .route("/events/history", get(history))
        .route("/events", get(events))
        .with_state(state)
}

async fn stats(State(s): State<AppState>) -> impl IntoResponse {
    let count = s.store.count().await.unwrap_or(0);
    let latest_slot = s.store.max_slot().await.unwrap_or(None);
    Json(serde_json::json!({
        "count": count,
        "latest_slot": latest_slot,
    }))
}

#[derive(serde::Deserialize)]
struct HistoryParams {
    limit: Option<u32>,
}

async fn history(
    State(s): State<AppState>,
    Query(p): Query<HistoryParams>,
) -> impl IntoResponse {
    let limit = p.limit.unwrap_or(50).min(200);
    let items = s.store.recent(limit).await.unwrap_or_default();
    Json(items)
}

async fn events(
    State(s): State<AppState>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = s.tx.subscribe();
    let stream = BroadcastStream::new(rx)
        .filter_map(|r| r.ok())
        .map(|ev: HandshakeEvent| {
            Ok(SseEvent::default()
                .event("handshake")
                .json_data(ev)
                .unwrap_or_else(|_| SseEvent::default()))
        });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
