-- ============ ROLE PERMISSIONS ============
-- Owner is never stored here — always full access. Manager/Staff are limited to whichever
-- page_key rows exist for their role; absence of a row means no access to that page.
CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    page_key TEXT NOT NULL,
    UNIQUE(role, page_key)
);

-- Sensible starting defaults — fully editable afterward via the Permissions screen.
INSERT INTO role_permissions (role, page_key) VALUES
    ('manager', 'sales'),
    ('manager', 'customers'),
    ('manager', 'inventory'),
    ('manager', 'services'),
    ('manager', 'packages'),
    ('manager', 'addons'),
    ('manager', 'promos'),
    ('manager', 'expenses'),
    ('manager', 'attendance'),
    ('staff', 'sales'),
    ('staff', 'customers'),
    ('staff', 'inventory');
