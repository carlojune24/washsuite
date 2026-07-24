-- Lets an item stocked in a coarse unit (e.g. liter) be added to an order in the
-- small increment it's actually dispensed in (e.g. 30ml), instead of the order-screen
-- stepper adding a whole unit per tap. dose_size is expressed in the item's own unit
-- (0.03 for 30ml when unit = liter); dose_label is what staff see instead of the
-- fractional-unit number (e.g. "30ml"). Zero/blank dose_size keeps the old
-- whole-unit-per-tap behavior for items that are genuinely sold by the unit.
ALTER TABLE inventory_items ADD COLUMN dose_size REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN dose_label TEXT;
