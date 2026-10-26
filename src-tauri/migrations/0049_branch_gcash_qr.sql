-- GCash QR code image for the branch, stored as a base64 data URL (same approach as
-- expenses.receipt_image), shown at checkout so customers can scan to pay.
ALTER TABLE branches ADD COLUMN gcash_qr_image TEXT;
