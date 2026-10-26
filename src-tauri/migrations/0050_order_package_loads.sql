-- Package price is charged per load. NULL on orders saved before this change (flat package price).
ALTER TABLE orders ADD COLUMN package_loads INTEGER;
