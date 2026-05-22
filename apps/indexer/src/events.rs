use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HandshakeEvent {
    pub signature: String,
    pub slot: u64,
    pub recipient: String,
    pub asset: String,
    pub edition: u32,
    pub ts: i64,
}
