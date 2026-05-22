use crate::events::HandshakeEvent;
use anyhow::{bail, Result};
use once_cell::sync::Lazy;
use regex::Regex;

pub const MPL_CORE_PROGRAM_ID: &str = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
/// Single-byte discriminator for CreateV2, from the mpl-core generated client
/// (`CreateV2InstructionData::new()` returns `Self { discriminator: 20 }`).
pub const CREATE_V2_DISCRIMINATOR: u8 = 20;

static RE_EDITION: Lazy<Regex> = Lazy::new(|| Regex::new(r"#(\d+)").unwrap());

/// Raw decoded instruction extracted from a Solana versioned transaction.
struct RawIx {
    program_id: String,
    /// Account pubkeys in instruction order (already resolved to base58).
    accounts: Vec<String>,
    /// Raw instruction data bytes.
    data: Vec<u8>,
}

/// Parse a compact-u16 (Solana wire format). Returns (value, bytes_consumed).
fn read_compact_u16(buf: &[u8]) -> Result<(usize, usize)> {
    let mut val: usize = 0;
    let mut shift = 0usize;
    let mut consumed = 0usize;
    loop {
        if consumed >= buf.len() {
            bail!("compact-u16 truncated");
        }
        let b = buf[consumed] as usize;
        consumed += 1;
        val |= (b & 0x7f) << shift;
        shift += 7;
        if (b & 0x80) == 0 {
            break;
        }
    }
    Ok((val, consumed))
}

/// Decode a base64-encoded Solana versioned transaction (the first element of
/// the `["<b64>","base64"]` pair returned by `getTransaction`).
///
/// Supports legacy messages and v0 messages. Returns a list of decoded
/// instructions with accounts already resolved to base58 pubkeys.
fn decode_instructions(tx_b64: &str) -> Result<Vec<RawIx>> {
    use base64::prelude::*;
    let tx_bytes = BASE64_STANDARD.decode(tx_b64)?;
    let buf = tx_bytes.as_slice();
    let mut off = 0usize;

    // --- signatures ---
    let (num_sigs, n) = read_compact_u16(&buf[off..])?;
    off += n;
    off += num_sigs * 64; // each sig is 64 bytes

    if off >= buf.len() {
        bail!("tx too short after signatures");
    }

    // --- message version prefix ---
    let prefix = buf[off];
    let is_v0 = (prefix & 0x80) != 0 && (prefix & 0x7f) == 0;
    let is_legacy = (prefix & 0x80) == 0;

    if !is_v0 && !is_legacy {
        bail!("unsupported message version prefix: 0x{:02x}", prefix);
    }
    if is_v0 {
        off += 1; // consume the 0x80 prefix
    }

    // --- header (3 bytes) ---
    if off + 3 > buf.len() {
        bail!("header truncated");
    }
    // num_required_signatures, num_readonly_signed_accounts, num_readonly_unsigned_accounts
    off += 3;

    // --- static account keys ---
    let (num_static, n) = read_compact_u16(&buf[off..])?;
    off += n;
    if off + num_static * 32 > buf.len() {
        bail!("static account keys truncated");
    }
    let mut static_accounts: Vec<String> = Vec::with_capacity(num_static);
    for _ in 0..num_static {
        let key = &buf[off..off + 32];
        static_accounts.push(bs58::encode(key).into_string());
        off += 32;
    }

    // --- recent blockhash (32 bytes) ---
    off += 32;

    // --- instructions ---
    let (num_ixs, n) = read_compact_u16(&buf[off..])?;
    off += n;

    let mut instructions: Vec<RawIx> = Vec::with_capacity(num_ixs);
    for _ in 0..num_ixs {
        if off >= buf.len() {
            bail!("instruction data truncated");
        }
        let prog_idx = buf[off] as usize;
        off += 1;

        let (num_accounts, n) = read_compact_u16(&buf[off..])?;
        off += n;

        let mut accounts = Vec::with_capacity(num_accounts);
        for _ in 0..num_accounts {
            if off >= buf.len() {
                bail!("account index truncated");
            }
            let acct_idx = buf[off] as usize;
            off += 1;
            let key = static_accounts
                .get(acct_idx)
                .cloned()
                .unwrap_or_else(|| format!("LOADED[{}]", acct_idx));
            accounts.push(key);
        }

        let (data_len, n) = read_compact_u16(&buf[off..])?;
        off += n;
        if off + data_len > buf.len() {
            bail!("ix data truncated");
        }
        let data = buf[off..off + data_len].to_vec();
        off += data_len;

        let program_id = static_accounts
            .get(prog_idx)
            .cloned()
            .unwrap_or_else(|| format!("LOADED[{}]", prog_idx));

        instructions.push(RawIx {
            program_id,
            accounts,
            data,
        });
    }

    Ok(instructions)
}

/// Decode a Solana transaction (as returned by `getTransaction` with
/// `encoding:"base64"`) looking for a Metaplex Core `CreateV2` instruction
/// that mints into `expected_collection`.
///
/// The `tx` value must be the JSON object at `result.transaction` — an array
/// `["<base64 bytes>", "base64"]`.
///
/// Returns `Some(HandshakeEvent)` on a matching CreateV2, `None` if no match.
/// Returns `Err` only for catastrophic parse failures (malformed base64, etc.).
pub fn try_decode_handshake(
    tx: &serde_json::Value,
    signature: &str,
    slot: u64,
    expected_collection: &str,
    ts: i64,
) -> Result<Option<HandshakeEvent>> {
    let tx_b64 = tx
        .get(0)
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("tx[0] is not a base64 string"))?;

    let instructions = match decode_instructions(tx_b64) {
        Ok(ixs) => ixs,
        Err(e) => {
            tracing::warn!("failed to decode tx {}: {}", signature, e);
            return Ok(None);
        }
    };

    for ix in &instructions {
        // 1. Must be the mpl-core program
        if ix.program_id != MPL_CORE_PROGRAM_ID {
            continue;
        }
        // 2. First data byte == CreateV2 discriminator
        if ix.data.first().copied() != Some(CREATE_V2_DISCRIMINATOR) {
            continue;
        }
        // Account layout (from mpl-core generated client):
        //   0: asset      (writable, signer)
        //   1: collection  (writable, optional — but always present in practice)
        //   2: authority   (optional signer)
        //   3: payer       (writable, signer)
        //   4: owner       (optional readonly)
        //   5: update_authority (optional)
        //   6: system_program
        //   7: log_wrapper (optional)
        let collection = ix.accounts.get(1).map(String::as_str).unwrap_or("");
        // 3. Must match our collection
        if collection != expected_collection {
            continue;
        }

        let asset = ix
            .accounts
            .first()
            .cloned()
            .unwrap_or_default();
        let recipient = ix
            .accounts
            .get(4)
            .cloned()
            .unwrap_or_default();

        // Parse name from instruction data:
        // byte 0: discriminator
        // byte 1: data_state (u8)
        // bytes 2..6: name length (u32 le)
        // bytes 6..6+len: name utf8
        let edition = parse_edition_from_data(&ix.data);

        return Ok(Some(HandshakeEvent {
            signature: signature.to_string(),
            slot,
            recipient,
            asset,
            edition,
            ts,
        }));
    }

    Ok(None)
}

fn parse_edition_from_data(data: &[u8]) -> u32 {
    // Layout after discriminator (offset 0):
    //   offset 1: data_state u8
    //   offset 2: name_len u32le
    //   offset 6: name bytes
    if data.len() < 6 {
        return 0;
    }
    let name_len = u32::from_le_bytes([data[2], data[3], data[4], data[5]]) as usize;
    let name_start = 6usize;
    let name_end = name_start + name_len;
    if name_end > data.len() {
        return 0;
    }
    let name = match std::str::from_utf8(&data[name_start..name_end]) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    parse_edition_from_name(name)
}

fn parse_edition_from_name(name: &str) -> u32 {
    RE_EDITION
        .captures(name)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edition_regex_extracts_number() {
        assert_eq!(parse_edition_from_name("Handshake with Sok — #7"), 7);
        assert_eq!(parse_edition_from_name("Handshake with Sok — #31"), 31);
        assert_eq!(parse_edition_from_name("no number"), 0);
        assert_eq!(parse_edition_from_name("#1"), 1);
    }
}
