-- Widens machine_sensors.channel from ('a','b') to ('a','b','c','d') -- ESP32 boards can now be
-- configured (via the setup portal) for up to 4 machines instead of a fixed 2. SQLite can't alter
-- a CHECK constraint in place, so the table is recreated; nothing else references
-- machine_sensors.id as a foreign key, so this is a plain copy-and-rename.
CREATE TABLE machine_sensors_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL UNIQUE REFERENCES machines(id) ON DELETE CASCADE,
    esp32_device_id INTEGER NOT NULL REFERENCES esp32_devices(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('a', 'b', 'c', 'd')),
    idle_baseline INTEGER,
    running_baseline INTEGER,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (esp32_device_id, channel)
);

INSERT INTO machine_sensors_new SELECT * FROM machine_sensors;
DROP TABLE machine_sensors;
ALTER TABLE machine_sensors_new RENAME TO machine_sensors;

CREATE INDEX IF NOT EXISTS idx_machine_sensors_device ON machine_sensors(esp32_device_id);
