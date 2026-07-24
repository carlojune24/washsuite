-- Lets staff price consumables without doing markup-percent math:
-- - inventory_items gets a fixed-peso markup option alongside the existing percent one,
--   for items sold directly by the unit.
-- - service_package_items gets a flat peso profit target per dose (e.g. "+PHP2.60" on a
--   30ml pour), so package builders can see cost + profit = price without any conversion.
ALTER TABLE inventory_items ADD COLUMN markup_type TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE inventory_items ADD COLUMN markup_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE service_package_items ADD COLUMN markup_amount REAL NOT NULL DEFAULT 0;
