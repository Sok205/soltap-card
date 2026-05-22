use axum::{body::to_bytes, http::Request};
use soltap_indexer::{
    events::HandshakeEvent,
    http::{router, AppState},
    store::Store,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower::ServiceExt;

fn sample(sig: &str, ed: u32) -> HandshakeEvent {
    HandshakeEvent {
        signature: sig.to_string(),
        slot: 100,
        recipient: "GvRTVy3Yvr34Xz1h5kujDWgtuLrdy9RBBFoWGbu4g9EP".to_string(),
        asset: format!("a-{sig}"),
        edition: ed,
        ts: 0,
    }
}

async fn make_state(seed: Vec<HandshakeEvent>) -> AppState {
    let store = Store::open("sqlite::memory:").await.unwrap();
    for e in &seed {
        store.insert(e).await.unwrap();
    }
    let (tx, _) = broadcast::channel(16);
    AppState {
        store: Arc::new(store),
        tx,
    }
}

#[tokio::test]
async fn stats_returns_count_and_max_slot() {
    let state = make_state(vec![sample("a", 1), sample("b", 2)]).await;
    let app = router(state);
    let res = app
        .oneshot(
            Request::builder()
                .uri("/stats")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let body = to_bytes(res.into_body(), 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["count"], 2);
    assert_eq!(v["latest_slot"], 100);
}

#[tokio::test]
async fn history_respects_limit_and_cap() {
    let state = make_state(
        (0..10)
            .map(|i| sample(&format!("s{i}"), i as u32))
            .collect(),
    )
    .await;
    let app = router(state);
    let res = app
        .oneshot(
            Request::builder()
                .uri("/events/history?limit=3")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let body = to_bytes(res.into_body(), 4096).await.unwrap();
    let arr: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert_eq!(arr.len(), 3);
}
