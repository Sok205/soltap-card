CREATE TABLE IF NOT EXISTS handshakes (
  signature TEXT PRIMARY KEY,
  slot      INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  asset     TEXT NOT NULL,
  edition   INTEGER NOT NULL,
  ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS handshakes_slot_idx ON handshakes(slot);
CREATE INDEX IF NOT EXISTS handshakes_ts_idx   ON handshakes(ts);
