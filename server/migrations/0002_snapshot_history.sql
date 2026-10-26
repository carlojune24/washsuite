-- One row per shop per calendar day instead of one row per shop, so the dashboard can look back
-- at past days (datepicker), not just the latest push. Backfills the existing single row per shop
-- using its received_at date rather than discarding it.
ALTER TABLE shop_snapshots ADD COLUMN snapshot_date DATE;
UPDATE shop_snapshots SET snapshot_date = received_at::date WHERE snapshot_date IS NULL;
ALTER TABLE shop_snapshots ALTER COLUMN snapshot_date SET NOT NULL;
ALTER TABLE shop_snapshots DROP CONSTRAINT shop_snapshots_pkey;
ALTER TABLE shop_snapshots ADD PRIMARY KEY (shop_id, snapshot_date);
