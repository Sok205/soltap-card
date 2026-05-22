use soltap_indexer::decoder::try_decode_handshake;

const SIGNATURE: &str =
    "4srsGtKBPUbgaGCjPkGUMjrXYrNZFXQzkxYjjwhenazHNyZRZTWxQ27D7TuLN6Pa38eaVUFnTuSigF862tHomNmW";
const SLOT: u64 = 463888262;
const COLLECTION: &str = "5btULRffJ1DAN8UREWUyxMvU3taFARZYo6d4u1TzrVeH";
const TS: i64 = 1_700_000_000;

fn fixture() -> serde_json::Value {
    let raw = include_str!("fixtures/createv2_4srsGtKB.json");
    let v: serde_json::Value = serde_json::from_str(raw).expect("fixture parses");
    v["transaction"].clone()
}

#[test]
fn decode_fixture_matches_expected_fields() {
    let tx = fixture();
    let event = try_decode_handshake(&tx, SIGNATURE, SLOT, COLLECTION, TS, None)
        .expect("decode succeeds")
        .expect("event is Some");

    assert_eq!(
        event.recipient,
        "H5ryPAh9FqjxopaGqYoaQ58pMAwJHA7xb2nPesx625wt"
    );
    assert_eq!(
        event.asset,
        "6DxQteyAPWNuNHJMwoHAmF1VKtTNovGmJt9mFPBwXYXG"
    );
    assert_eq!(event.edition, 1);
    assert_eq!(event.signature, SIGNATURE);
    assert_eq!(event.slot, SLOT);
    assert_eq!(event.ts, TS);
}

#[test]
fn wrong_collection_returns_none() {
    let tx = fixture();
    let result = try_decode_handshake(
        &tx,
        SIGNATURE,
        SLOT,
        "WRONG_COLLECTION_111111111111111111111111111",
        TS,
        None,
    )
    .expect("decode succeeds");

    assert!(
        result.is_none(),
        "expected None when collection doesn't match, got: {:?}",
        result
    );
}
