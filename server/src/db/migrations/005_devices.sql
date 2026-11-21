CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  name TEXT NOT NULL,
  os TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  paired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT
);

CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id),
  device_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
