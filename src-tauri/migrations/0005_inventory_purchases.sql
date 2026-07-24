-- Restocking is one purchase/receipt covering multiple items, not a
-- per-item event. Model it as a purchase header (one receipt) with many
-- inventory_movements lines (one per item bought on that receipt).
CREATE TABLE IF NOT EXISTS inventory_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    supplier TEXT,
    reference TEXT,
    notes TEXT,
    receipt_image TEXT,
    purchase_date TEXT NOT NULL DEFAULT (date('now')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE inventory_movements ADD COLUMN purchase_id INTEGER REFERENCES inventory_purchases(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements DROP COLUMN receipt_image;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_purchase ON inventory_movements(purchase_id);
