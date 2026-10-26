-- Single row (id=1), same pattern as license_state -- one monitoring registration per install.
CREATE TABLE IF NOT EXISTS monitoring_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shop_id TEXT NOT NULL,
    api_token TEXT NOT NULL,
    dashboard_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_push_at TEXT,
    last_push_ok INTEGER,
    last_push_error TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
