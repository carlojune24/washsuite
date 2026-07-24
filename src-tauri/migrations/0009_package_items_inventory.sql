-- Package items should reference physical stock (inventory_items), not the
-- service catalog -- a package bundles specific goods (e.g. "2x fabric
-- softener sachet") plus its own price, distinct from what service it's for.
-- No real package data exists yet (feature just built), so recreate rather
-- than migrate the column.
DROP TABLE IF EXISTS service_package_items;

CREATE TABLE IF NOT EXISTS service_package_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_service_package_items_package ON service_package_items(package_id);
