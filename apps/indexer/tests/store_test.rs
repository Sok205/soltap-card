use soltap_indexer::events::HandshakeEvent;
use soltap_indexer::store::Store;

fn sample(sig: &str, slot: u64, edition: u32, ts: i64) -> HandshakeEvent {
    HandshakeEvent {
        signature: sig.to_string(),
        slot,
        recipient: "GvRTVy3Yvr34Xz1h5kujDWgtuLrdy9RBBFoWGbu4g9EP".to_string(),
        asset: format!("asset{sig}"),
        edition,
        ts,
    }
}

#[tokio::test]
async fn round_trip_insert_count_recent() {
    let store = Store::open("sqlite::memory:").await.unwrap();
    assert_eq!(store.count().await.unwrap(), 0);

    store.insert(&sample("sig1", 100, 1, 1000)).await.unwrap();
    store.insert(&sample("sig2", 101, 2, 1010)).await.unwrap();
    store.insert(&sample("sig3", 102, 3, 1020)).await.unwrap();

    assert_eq!(store.count().await.unwrap(), 3);

    let recent = store.recent(2).await.unwrap();
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].edition, 3);
    assert_eq!(recent[1].edition, 2);
}

#[tokio::test]
async fn insert_is_idempotent() {
    let store = Store::open("sqlite::memory:").await.unwrap();
    let e = sample("dup", 1, 1, 1);
    store.insert(&e).await.unwrap();
    store.insert(&e).await.unwrap();
    store.insert(&e).await.unwrap();
    assert_eq!(store.count().await.unwrap(), 1);
}

#[tokio::test]
async fn max_slot_returns_highest_or_none() {
    let store = Store::open("sqlite::memory:").await.unwrap();
    assert_eq!(store.max_slot().await.unwrap(), None);

    store.insert(&sample("a", 5, 1, 1)).await.unwrap();
    store.insert(&sample("b", 12, 2, 2)).await.unwrap();
    store.insert(&sample("c", 9, 3, 3)).await.unwrap();
    assert_eq!(store.max_slot().await.unwrap(), Some(12));
}
