-- Receipt/proof-of-payment photo for an expense, stored as a base64 data URL
-- (same client-side-compressed approach as inventory_purchases.receipt_image).
ALTER TABLE expenses ADD COLUMN receipt_image TEXT;
