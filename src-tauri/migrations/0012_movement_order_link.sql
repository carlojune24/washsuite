-- Link inventory movements back to the order that caused them, so a usage
-- movement (stock deducted by a sale) can be traced to both the order and
-- (via consumed_from_movement_id, added in 0007) the specific batch it drew from.
ALTER TABLE inventory_movements ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;
