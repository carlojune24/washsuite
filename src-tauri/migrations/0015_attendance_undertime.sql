-- Undertime hours, auto-computed against an 8-hour day at clock-out but editable afterward
-- (mirrors overtime_hours added in 0014).
ALTER TABLE attendance ADD COLUMN undertime_hours REAL NOT NULL DEFAULT 0;
