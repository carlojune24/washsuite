-- Per-physical-load tags: printed one per load on an order (e.g. 3 loads -> 3 tags) so
-- each bag going into a machine carries its own number. Numbered against a daily sequence
-- that resets to 1 for each new business day, since that's what the owner tracks loads by.
CREATE TABLE IF NOT EXISTS load_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    load_index INTEGER NOT NULL, -- 1-based position within this order's loads
    tag_date TEXT NOT NULL, -- business day (YYYY-MM-DD) this tag's sequence belongs to
    daily_number INTEGER NOT NULL, -- resets to 1 at the start of each tag_date
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(order_id, load_index),
    UNIQUE(tag_date, daily_number)
);

CREATE INDEX IF NOT EXISTS idx_load_tags_order ON load_tags(order_id);
CREATE INDEX IF NOT EXISTS idx_load_tags_date ON load_tags(tag_date);
