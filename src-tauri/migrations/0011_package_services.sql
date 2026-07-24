-- Packages can also include billable services (e.g. "Wash & Fold x 8kg"),
-- not just physical stock items.
CREATE TABLE IF NOT EXISTS service_package_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_service_package_services_package ON service_package_services(package_id);
