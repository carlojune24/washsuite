-- ============ DEDUCTIONS (government mandatory + custom, dynamic catalog) ============

-- The dynamic catalog of deduction types (SSS, PhilHealth, Pag-IBIG, or any custom one added later).
-- employee_share/employer_share here are just defaults offered when assigning a new type to a worker.
CREATE TABLE IF NOT EXISTS deduction_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_share REAL NOT NULL DEFAULT 0,
    employer_share REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Which deduction types apply to a given worker, and their actual EE/ER amounts
-- (contribution brackets vary per worker, so this is per-worker, not shared).
CREATE TABLE IF NOT EXISTS worker_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    deduction_type_id INTEGER NOT NULL REFERENCES deduction_types(id) ON DELETE CASCADE,
    employee_share REAL NOT NULL DEFAULT 0,
    employer_share REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(worker_id, deduction_type_id)
);

-- One remittance record per worker per period ('YYYY-MM'), capturing the actual payment date.
CREATE TABLE IF NOT EXISTS deduction_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    payment_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | paid
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(worker_id, period)
);

-- Snapshot of each deduction type's EE/ER amount at the time a period was paid,
-- so later edits to worker_deductions don't rewrite payment history.
CREATE TABLE IF NOT EXISTS deduction_payment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES deduction_payments(id) ON DELETE CASCADE,
    deduction_type_id INTEGER NOT NULL REFERENCES deduction_types(id),
    employee_share REAL NOT NULL,
    employer_share REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_deductions_worker ON worker_deductions(worker_id);
CREATE INDEX IF NOT EXISTS idx_deduction_payments_worker_period ON deduction_payments(worker_id, period);
CREATE INDEX IF NOT EXISTS idx_deduction_payment_items_payment ON deduction_payment_items(payment_id);

-- Seeded with names only — real SSS/PhilHealth/Pag-IBIG amounts vary by salary bracket
-- and change periodically, so defaults start at 0 rather than baking in stale figures.
INSERT OR IGNORE INTO deduction_types (id, name, employee_share, employer_share) VALUES
    (1, 'SSS', 0, 0),
    (2, 'PhilHealth', 0, 0),
    (3, 'Pag-IBIG', 0, 0);
