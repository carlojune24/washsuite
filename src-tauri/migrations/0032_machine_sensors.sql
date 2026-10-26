-- Physical washers/dryers, the ESP32 boards reporting light-sensor readings for them, and the
-- binding between a sensor channel and the machine it's pointed at. See sensors.rs for the
-- ingest side (an ESP32 announces itself with its own device_id the first time it POSTs a
-- reading) -- registration itself (which channel is which machine) happens entirely here, driven
-- from the Machines settings screen.
CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL, -- e.g. "Washer 3"
    type TEXT NOT NULL CHECK (type IN ('washer', 'dryer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esp32_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL UNIQUE, -- ESP32 WiFi MAC address, stable across reboots/reflashes
    label TEXT, -- optional admin-friendly name
    ip_address TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per bound TEMT6000 channel. A machine can only have one sensor, and a channel can
-- only be bound to one machine -- both enforced so the live-identify flow can't double-bind.
CREATE TABLE IF NOT EXISTS machine_sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL UNIQUE REFERENCES machines(id) ON DELETE CASCADE,
    esp32_device_id INTEGER NOT NULL REFERENCES esp32_devices(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('a', 'b')),
    idle_baseline INTEGER, -- reserved for future running/idle status detection, unused for now
    running_baseline INTEGER,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (esp32_device_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_machines_branch ON machines(branch_id);
CREATE INDEX IF NOT EXISTS idx_machine_sensors_device ON machine_sensors(esp32_device_id);
