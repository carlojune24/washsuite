-- Persist the price paid per item on each restock line, so a past purchase's
-- total can be reconstructed later instead of relying on inventory_items'
-- current purchase_price (which gets overwritten by later restocks).
ALTER TABLE inventory_movements ADD COLUMN unit_price REAL;
