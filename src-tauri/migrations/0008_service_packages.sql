-- Service packages (bundles a customer can pick at checkout instead of
-- customizing an order line by line) and a reusable add-on catalog
-- (small optional extras like "Extra Rinse - +₱10").

CREATE TABLE IF NOT EXISTS add_ons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    image TEXT, -- base64 data URL, compressed client-side (same approach as receipt photos)
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What's included in a package: a service_type + how much of it (e.g. "Wash & Fold x 8kg").
CREATE TABLE IF NOT EXISTS service_package_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 1
);

-- Which add-ons a customer can optionally attach to this package at checkout.
CREATE TABLE IF NOT EXISTS service_package_add_ons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    add_on_id INTEGER NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_package_items_package ON service_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_service_package_add_ons_package ON service_package_add_ons(package_id);
