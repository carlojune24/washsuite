-- Inventory item management: item description, split purchase vs. retail
-- pricing (some items like packaging/sachets are also sold to customers),
-- and a photo of the purchase receipt captured on restock.
ALTER TABLE inventory_items ADD COLUMN description TEXT;
ALTER TABLE inventory_items ADD COLUMN retail_price REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_items RENAME COLUMN unit_cost TO purchase_price;

-- Compressed base64 data URL of the restock purchase receipt (restock movements only).
ALTER TABLE inventory_movements ADD COLUMN receipt_image TEXT;
