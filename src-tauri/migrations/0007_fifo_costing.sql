-- Switch from a single fixed purchase/retail price per item to FIFO batch
-- costing: each restock movement is a cost "batch" with its own unit_price
-- (already added in 0006) and a remaining quantity, consumed oldest-first.
-- Item-level pricing becomes a markup applied over whatever the active
-- (oldest unconsumed) batch's cost is, instead of a fixed retail_price.

ALTER TABLE inventory_items ADD COLUMN markup_percent REAL NOT NULL DEFAULT 0;

-- Backfill markup from the old fixed prices so existing items keep an
-- equivalent margin instead of resetting to 0%.
UPDATE inventory_items
SET markup_percent = CASE
    WHEN purchase_price > 0 THEN ROUND((retail_price - purchase_price) * 100.0 / purchase_price, 2)
    ELSE 0
END;

ALTER TABLE inventory_items DROP COLUMN purchase_price;
ALTER TABLE inventory_items DROP COLUMN retail_price;

-- FIFO batch tracking: how much of a restock line is still unconsumed, and
-- (for future usage/waste/sale movements) which batch a draw-down came from.
ALTER TABLE inventory_movements ADD COLUMN quantity_remaining REAL;
ALTER TABLE inventory_movements ADD COLUMN consumed_from_movement_id INTEGER REFERENCES inventory_movements(id) ON DELETE SET NULL;

-- Nothing has been consumed yet (no usage/sale flow exists), so every
-- existing restock batch's remaining quantity is its full original quantity.
UPDATE inventory_movements SET quantity_remaining = quantity WHERE movement_type = 'restock';
