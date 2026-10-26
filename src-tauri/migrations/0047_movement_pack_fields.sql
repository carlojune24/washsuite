-- Audit metadata for pack/tie-based purchasing (e.g. "6+1 promo x 7 ties x 90/tie"). quantity and
-- unit_price on the movement remain the real inputs to FIFO costing -- these columns just preserve
-- how the total was worked out, for reference on the purchase detail screen.
ALTER TABLE inventory_movements ADD COLUMN pack_size REAL;
ALTER TABLE inventory_movements ADD COLUMN pack_bonus REAL;
ALTER TABLE inventory_movements ADD COLUMN pack_count REAL;
