-- ============ LOYALTY / POINTS SYSTEM ============

-- Singleton config row (always id=1) controlling how many points an order earns.
-- mode = 'per_amount': floor(order_total / amount_per_point) points.
-- mode = 'flat': flat_points_per_order points, regardless of order total.
CREATE TABLE IF NOT EXISTS loyalty_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'per_amount', -- per_amount | flat
    amount_per_point REAL NOT NULL DEFAULT 100,
    flat_points_per_order REAL NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO loyalty_settings (id) VALUES (1);

-- Dynamic tier catalog (e.g. Bronze/Silver/Gold). A customer's tier is the highest tier
-- whose min_points they meet or exceed; below every threshold means "No Tier".
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    min_points INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO loyalty_tiers (id, name, min_points) VALUES
    (1, 'Bronze', 1),
    (2, 'Silver', 80);

-- Auditable log of every points award, so "points earned this month/week" can be computed
-- accurately instead of re-deriving it from orders under whatever the *current* rate happens
-- to be (which would silently misrepresent history if the rate is ever changed later).
CREATE TABLE IF NOT EXISTS loyalty_point_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    points REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loyalty_point_events_customer ON loyalty_point_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_point_events_created ON loyalty_point_events(created_at);
