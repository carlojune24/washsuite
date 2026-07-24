-- Track redeemed loyalty points separately from the running total, so the
-- customer detail view can show total earned vs. redeemed vs. available.
ALTER TABLE customers ADD COLUMN redeemed_points INTEGER NOT NULL DEFAULT 0;
