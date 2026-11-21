CREATE TABLE children (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  age_band TEXT NOT NULL CHECK (age_band IN ('7-10', '11-14', '15-17')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
