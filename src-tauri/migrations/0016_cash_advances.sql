CREATE TABLE IF NOT EXISTS cash_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    advance_date TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'outstanding', -- outstanding | settled
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_advances_worker ON cash_advances(worker_id);
