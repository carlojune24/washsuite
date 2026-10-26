-- One row per completed wash/dry cycle ("load"), logged when a bound sensor's reading drops
-- from "running" back to "idle" (see src/lib/machineStatus.tsx). cycle_date follows the same
-- business-day convention as load_tags.tag_date, so "loads today" resets each day the same way
-- load tag numbers do.
CREATE TABLE IF NOT EXISTS machine_cycle_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    cycle_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machine_cycle_logs_machine_date ON machine_cycle_logs(machine_id, cycle_date);
