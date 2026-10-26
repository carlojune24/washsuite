-- Ground-truth data collection for future cycle-completion pattern detection (the actual
-- mechanism for eventually filling in machine_sensors.idle_baseline/running_baseline with real
-- data instead of a guess). A session records every raw reading while it's active; ended_at is
-- set when the admin manually flags that the physical machine just finished its cycle, since
-- cycle duration varies by wash setting and can't be inferred from elapsed time alone.
CREATE TABLE IF NOT EXISTS machine_calibration_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT -- NULL while the session is still recording
);

CREATE TABLE IF NOT EXISTS machine_calibration_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES machine_calibration_sessions(id) ON DELETE CASCADE,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    reading INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calibration_sessions_machine ON machine_calibration_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_calibration_samples_session ON machine_calibration_samples(session_id);
