-- Multiple registered BIR OR (official receipt) series over time, replacing the single
-- range that used to live on branches.or_series_start/or_series_end. Also tracks numbers
-- spoiled/damaged before ever being assigned to an order, for BIR liquidation reporting.
CREATE TABLE or_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL DEFAULT 1,
  series_start INTEGER NOT NULL,
  series_end INTEGER NOT NULL,
  next_number INTEGER NOT NULL,
  permit_no TEXT,
  registered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE or_series_voids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  or_series_id INTEGER NOT NULL REFERENCES or_series(id),
  or_number INTEGER NOT NULL,
  reason TEXT,
  voided_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_by INTEGER REFERENCES users(id),
  UNIQUE(or_series_id, or_number)
);

ALTER TABLE orders ADD COLUMN or_series_id INTEGER REFERENCES or_series(id);

-- Backfill: turn the branch's existing range into its first series row, and link
-- already-issued invoice numbers to it. branches.or_series_start/or_series_end/
-- next_invoice_number are left in place but unused from here on.
INSERT INTO or_series (branch_id, series_start, series_end, next_number, permit_no, registered_at, status)
SELECT 1, or_series_start, or_series_end, COALESCE(next_invoice_number, or_series_start), bir_permit_no,
       date('now'),
       CASE WHEN COALESCE(next_invoice_number, or_series_start) > or_series_end THEN 'closed' ELSE 'active' END
FROM branches
WHERE id = 1 AND or_series_start IS NOT NULL AND or_series_end IS NOT NULL;

UPDATE orders SET or_series_id = (SELECT id FROM or_series ORDER BY id LIMIT 1) WHERE invoice_number IS NOT NULL;
