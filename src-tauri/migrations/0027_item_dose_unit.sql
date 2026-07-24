-- Lets InventoryItemForm accept a dose in a small unit (e.g. "30" for ml) instead of a raw
-- fraction of the item's base unit (0.03). dose_size/dose_label (0026) remain the values every
-- other page actually reads -- these two columns are input-UX sugar consumed only by the item
-- form, which converts to/from dose_size using this factor. 0 means "not using small-unit mode",
-- matching dose_size's existing 0-means-off convention.
ALTER TABLE inventory_items ADD COLUMN dose_unit_label TEXT;
ALTER TABLE inventory_items ADD COLUMN dose_unit_factor REAL NOT NULL DEFAULT 0;
