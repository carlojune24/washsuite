-- Points-as-discount redemption. redeem_value_per_point can differ from the earning rate
-- (amount_per_point) so the owner can protect margin on the "burn" side independently of
-- the "earn" side. max_redemption_percent caps how much of a single order's subtotal can be
-- covered by points, so a large points balance can never fully zero out a big order.
ALTER TABLE loyalty_settings ADD COLUMN redeem_value_per_point REAL NOT NULL DEFAULT 1;
ALTER TABLE loyalty_settings ADD COLUMN max_redemption_percent REAL NOT NULL DEFAULT 50;

-- Distinguishes earn vs redeem rows in loyalty_point_events (redemptions are logged as
-- negative points) so "points earned this month" can filter correctly instead of netting
-- earned-minus-redeemed.
ALTER TABLE loyalty_point_events ADD COLUMN type TEXT NOT NULL DEFAULT 'earn';
