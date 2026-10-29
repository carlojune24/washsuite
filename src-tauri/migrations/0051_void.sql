-- Soft-void for expenses and restocks: row stays for audit, but is excluded from lists/reports
-- and its cashflow entry is removed by the app.
ALTER TABLE expenses ADD COLUMN voided_at TEXT;
ALTER TABLE inventory_purchases ADD COLUMN voided_at TEXT;
