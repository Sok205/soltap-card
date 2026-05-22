use crate::events::HandshakeEvent;
use anyhow::{Context, Result};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Pool, Sqlite,
};
use std::str::FromStr;

#[derive(Clone)]
pub struct Store {
    pool: Pool<Sqlite>,
}

impl Store {
    /// Open (or create) a SQLite database at the given URL and run migrations.
    /// URL examples:
    /// - `sqlite::memory:` (tests)
    /// - `sqlite:./soltap.db` (local file)
    pub async fn open(url: &str) -> Result<Self> {
        let opts = SqliteConnectOptions::from_str(url)
            .with_context(|| format!("invalid sqlite url: {url}"))?
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .context("opening sqlite pool")?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .context("running migrations")?;
        Ok(Self { pool })
    }

    /// Insert idempotently. Duplicate signatures are silently ignored.
    pub async fn insert(&self, e: &HandshakeEvent) -> Result<()> {
        sqlx::query(
            "INSERT OR IGNORE INTO handshakes
             (signature, slot, recipient, asset, edition, ts)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&e.signature)
        .bind(e.slot as i64)
        .bind(&e.recipient)
        .bind(&e.asset)
        .bind(e.edition as i64)
        .bind(e.ts)
        .execute(&self.pool)
        .await
        .context("insert handshake")?;
        Ok(())
    }

    pub async fn count(&self) -> Result<u64> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM handshakes")
            .fetch_one(&self.pool)
            .await
            .context("count handshakes")?;
        Ok(row.0 as u64)
    }

    /// Return the N most recent handshakes ordered by `ts DESC, slot DESC`.
    pub async fn recent(&self, limit: u32) -> Result<Vec<HandshakeEvent>> {
        let rows: Vec<(String, i64, String, String, i64, i64)> = sqlx::query_as(
            "SELECT signature, slot, recipient, asset, edition, ts
             FROM handshakes
             ORDER BY ts DESC, slot DESC
             LIMIT ?",
        )
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await
        .context("recent handshakes")?;
        Ok(rows
            .into_iter()
            .map(|(signature, slot, recipient, asset, edition, ts)| HandshakeEvent {
                signature,
                slot: slot as u64,
                recipient,
                asset,
                edition: edition as u32,
                ts,
            })
            .collect())
    }

    /// Highest slot we've seen — used by future backfill logic (Task 4.2).
    pub async fn max_slot(&self) -> Result<Option<u64>> {
        let row: (Option<i64>,) = sqlx::query_as("SELECT MAX(slot) FROM handshakes")
            .fetch_one(&self.pool)
            .await
            .context("max slot")?;
        Ok(row.0.map(|v| v as u64))
    }
}
