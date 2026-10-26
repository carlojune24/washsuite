-- Non-resettable accumulating grand total per branch, required for BIR CAS/POS
-- accreditation as the audit anchor Z-readings reconcile against. The trigger enforces
-- "non-resettable" at the DB layer, not just by app-code convention.
CREATE TABLE grand_total_counter (
  branch_id INTEGER PRIMARY KEY REFERENCES branches(id),
  running_total REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER grand_total_no_decrease
BEFORE UPDATE ON grand_total_counter
WHEN NEW.running_total < OLD.running_total
BEGIN
  SELECT RAISE(ABORT, 'grand total cannot decrease');
END;

INSERT INTO grand_total_counter (branch_id, running_total) SELECT id, 0 FROM branches;
