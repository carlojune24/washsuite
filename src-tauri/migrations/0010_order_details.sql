-- New Order flow: capture load size/count, which package (if any) was
-- picked, and let order line items reference actual stock items / add-ons
-- (not just service_types) for custom orders.
ALTER TABLE orders ADD COLUMN kg REAL;
ALTER TABLE orders ADD COLUMN loads INTEGER;
ALTER TABLE orders ADD COLUMN package_id INTEGER REFERENCES service_packages(id) ON DELETE SET NULL;

ALTER TABLE order_items ADD COLUMN item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN add_on_id INTEGER REFERENCES add_ons(id) ON DELETE SET NULL;
