-- Fixed classification per item: whether it's consumed delivering the service (detergent,
-- fabric conditioner -- a cost of the service you sell) or a general business supply (trash
-- bags, packaging). Set once on the item so restocks auto-inherit it instead of asking every time.
ALTER TABLE inventory_items ADD COLUMN usage_type TEXT NOT NULL DEFAULT 'consumable';
