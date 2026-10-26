-- Cleans up an earlier, never-committed LG ThinQ cloud-API integration attempt: thinq_settings
-- and machine_cycle_logs, plus a `machines` table shaped for it (thinq_device_id NOT NULL
-- UNIQUE, model_name). No application code for that approach ever shipped in this repo -- these
-- tables exist only because they were created directly against the database outside the
-- migration system (there's a gap where migration 30 should be). Since 0032's own `CREATE TABLE
-- IF NOT EXISTS machines` silently no-op'd against that pre-existing table, `machines` on any
-- database that went through this never actually got the shape 0032 intended. All three tables
-- are empty, so this just drops and recreates `machines` to match 0032's real design.
DROP TABLE IF EXISTS machine_cycle_logs;
DROP TABLE IF EXISTS thinq_settings;
DROP TABLE IF EXISTS machines;

CREATE TABLE machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('washer', 'dryer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_machines_branch ON machines(branch_id);
