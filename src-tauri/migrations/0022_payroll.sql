-- ============ PAYROLL SETTINGS ============

-- Singleton config row (id=1). overtime_multiplier is applied against a worker's
-- hourly-equivalent rate when computing overtime pay on a payroll run.
-- 1.25 matches the standard Philippine ordinary-day OT premium (125%).
CREATE TABLE IF NOT EXISTS payroll_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    overtime_multiplier REAL NOT NULL DEFAULT 1.25
);
INSERT OR IGNORE INTO payroll_settings (id) VALUES (1);

-- Links a settled cash advance back to the payslip that paid it off, so rolling a payroll run
-- back from "paid" to "draft" can precisely restore only the advances IT settled, not any
-- unrelated ones a worker may have picked up since.
ALTER TABLE cash_advances ADD COLUMN payslip_id INTEGER REFERENCES payslips(id) ON DELETE SET NULL;
