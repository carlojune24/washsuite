-- Immutable, append-only daily sales close (Z-reading). sequence_no lets a BIR auditor
-- detect skipped/missing closes the same way or_series numbers expose gaps. Rows can never
-- be edited or deleted once created, matching the required audit trail.
CREATE TABLE z_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  terminal_id TEXT NOT NULL DEFAULT 'MAIN',
  sequence_no INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  beginning_grand_total REAL NOT NULL,
  ending_grand_total REAL NOT NULL,
  gross_sales REAL NOT NULL,
  vatable_sales REAL NOT NULL,
  vat_amount REAL NOT NULL,
  vat_exempt_sales REAL NOT NULL,
  zero_rated_sales REAL NOT NULL,
  sc_pwd_discount_total REAL NOT NULL,
  other_discount_total REAL NOT NULL,
  cash_sales REAL NOT NULL,
  cashless_sales REAL NOT NULL,
  transaction_count INTEGER NOT NULL,
  generated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(branch_id, terminal_id, sequence_no)
);

CREATE TRIGGER z_readings_immutable_update
BEFORE UPDATE ON z_readings
BEGIN
  SELECT RAISE(ABORT, 'z_readings rows are immutable');
END;

CREATE TRIGGER z_readings_immutable_delete
BEFORE DELETE ON z_readings
BEGIN
  SELECT RAISE(ABORT, 'z_readings rows are immutable');
END;
