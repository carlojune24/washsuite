-- Local cache of the last successful license check. A single row (id fixed to 1, upserted).
-- machine_fingerprint here is compared against a freshly-computed one on every launch: a
-- mismatch means this install (db file and all) was copied onto different hardware, which is
-- treated the same as having no license at all until it's re-activated on this machine.
CREATE TABLE IF NOT EXISTS license_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    machine_fingerprint TEXT NOT NULL,
    license_key TEXT NOT NULL,
    plan TEXT,
    valid_until TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
