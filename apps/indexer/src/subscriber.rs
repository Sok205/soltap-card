use crate::{decoder::try_decode_handshake, events::HandshakeEvent, store::Store};
use anyhow::{Context, Result};
use std::time::Duration;
use tokio::sync::broadcast;

/// A chain subscriber. Implementations watch on-chain activity in our
/// collection and emit HandshakeEvents.
pub trait Subscriber {
    /// Run forever. Should retry transient errors internally; only return
    /// `Err` for unrecoverable failures.
    fn run(
        self,
        store: Store,
        tx: broadcast::Sender<HandshakeEvent>,
    ) -> impl std::future::Future<Output = Result<()>> + Send;
}

pub struct PollingSubscriber {
    pub rpc_url: String,
    pub collection: String,
    pub poll_interval: Duration,
}

impl PollingSubscriber {
    pub fn new(rpc_url: String, collection: String) -> Self {
        Self {
            rpc_url,
            collection,
            poll_interval: Duration::from_secs(3),
        }
    }
}

impl Subscriber for PollingSubscriber {
    async fn run(self, store: Store, tx: broadcast::Sender<HandshakeEvent>) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .context("build http client")?;

        // Bootstrap: pick up where we left off. The newest stored signature
        // becomes the `until` cursor — RPC won't return it again.
        let mut last_sig: Option<String> = store
            .recent(1)
            .await
            .ok()
            .and_then(|rs| rs.into_iter().next())
            .map(|e| e.signature);

        tracing::info!(?last_sig, "subscriber starting");

        let mut interval = tokio::time::interval(self.poll_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            interval.tick().await;

            match poll_once(&client, &self.rpc_url, &self.collection, last_sig.as_deref()).await {
                Ok(new_sigs) => {
                    if new_sigs.is_empty() {
                        continue;
                    }
                    // RPC returns newest-first; flip to chronological so we
                    // update last_sig to the actual newest after processing.
                    let newest_sig = new_sigs[0].signature.clone();
                    for sig_info in new_sigs.into_iter().rev() {
                        match fetch_and_decode(
                            &client,
                            &self.rpc_url,
                            &self.collection,
                            &sig_info,
                        )
                        .await
                        {
                            Ok(Some(ev)) => {
                                if let Err(e) = store.insert(&ev).await {
                                    tracing::warn!(error = ?e, "store insert");
                                }
                                let _ = tx.send(ev.clone());
                                tracing::info!(
                                    signature = %ev.signature,
                                    edition = ev.edition,
                                    "handshake"
                                );
                            }
                            Ok(None) => {} // not a handshake tx — skip
                            Err(e) => {
                                tracing::warn!(sig = %sig_info.signature, error = ?e, "decode/fetch");
                            }
                        }
                    }
                    last_sig = Some(newest_sig);
                }
                Err(e) => {
                    tracing::warn!(error = ?e, "poll");
                }
            }
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
struct SigInfo {
    pub signature: String,
    #[serde(default)]
    #[allow(dead_code)] // retained for future cursor/backfill logic
    pub slot: u64,
    #[serde(default, rename = "blockTime")]
    pub block_time: Option<i64>,
}

async fn poll_once(
    client: &reqwest::Client,
    rpc_url: &str,
    address: &str,
    until: Option<&str>,
) -> Result<Vec<SigInfo>> {
    let mut opts = serde_json::json!({ "limit": 25 });
    if let Some(u) = until {
        opts["until"] = serde_json::Value::String(u.to_string());
    }
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address, opts],
    });
    let res: serde_json::Value = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;
    let arr = res
        .get("result")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let sigs: Vec<SigInfo> = serde_json::from_value(serde_json::Value::Array(arr))?;
    Ok(sigs)
}

async fn fetch_and_decode(
    client: &reqwest::Client,
    rpc_url: &str,
    expected_collection: &str,
    sig_info: &SigInfo,
) -> Result<Option<HandshakeEvent>> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [sig_info.signature, {
            "encoding": "base64",
            "maxSupportedTransactionVersion": 0,
            "commitment": "confirmed",
        }],
    });
    let res: serde_json::Value = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await?
        .json()
        .await?;

    let result = match res.get("result") {
        Some(r) if !r.is_null() => r,
        _ => return Ok(None), // pruned / not yet visible
    };

    // result.transaction = ["<base64 bytes>", "base64"]
    // Pass this array directly to try_decode_handshake which expects tx[0] to be the b64 string.
    let tx_arr = result
        .get("transaction")
        .context("no transaction field in getTransaction response")?;

    let slot = result.get("slot").and_then(|v| v.as_u64()).unwrap_or(0);
    let ts = result
        .get("blockTime")
        .and_then(|v| v.as_i64())
        .or(sig_info.block_time)
        .unwrap_or_else(|| chrono::Utc::now().timestamp());

    try_decode_handshake(tx_arr, &sig_info.signature, slot, expected_collection, ts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poll_once_deserializes_response() {
        // Simulate a `getSignaturesForAddress` result array.
        let raw = serde_json::json!([
            {
                "signature": "5J2abc",
                "slot": 100,
                "blockTime": 1700000010,
                "confirmationStatus": "finalized",
                "err": null,
                "memo": null
            },
            {
                "signature": "4Xdef",
                "slot": 99,
                "blockTime": 1700000000,
                "confirmationStatus": "finalized",
                "err": null,
                "memo": null
            }
        ]);

        let sigs: Vec<SigInfo> = serde_json::from_value(raw).expect("deserialize");
        assert_eq!(sigs.len(), 2);
        assert_eq!(sigs[0].signature, "5J2abc");
        assert_eq!(sigs[0].slot, 100);
        assert_eq!(sigs[0].block_time, Some(1700000010));
        assert_eq!(sigs[1].signature, "4Xdef");
        assert_eq!(sigs[1].slot, 99);
    }

    #[test]
    fn poll_once_deserializes_empty() {
        let raw = serde_json::json!([]);
        let sigs: Vec<SigInfo> = serde_json::from_value(raw).expect("deserialize");
        assert!(sigs.is_empty());
    }

    #[test]
    fn poll_once_deserializes_missing_optional_fields() {
        // blockTime can be null/missing for unconfirmed txs
        let raw = serde_json::json!([
            { "signature": "abc123", "slot": 0, "blockTime": null }
        ]);
        let sigs: Vec<SigInfo> = serde_json::from_value(raw).expect("deserialize");
        assert_eq!(sigs[0].block_time, None);
    }
}
