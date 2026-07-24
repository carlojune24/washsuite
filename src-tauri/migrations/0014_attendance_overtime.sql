-- Manual overtime hours per attendance record (entered by staff, not auto-computed).
ALTER TABLE attendance ADD COLUMN overtime_hours REAL NOT NULL DEFAULT 0;
