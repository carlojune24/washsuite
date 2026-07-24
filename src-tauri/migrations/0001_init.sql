-- WashSuite initial schema
-- SQLite (via tauri-plugin-sql). Applied automatically as migration 1 on app start.
PRAGMA foreign_keys = ON;

-- ============ CORE / BRANCHES ============
CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff', -- owner | manager | staff
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CUSTOMER MANAGEMENT ============
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ INVENTORY MANAGEMENT ============
CREATE TABLE IF NOT EXISTS inventory_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pc', -- pc, sack, gallon, box, etc.
    quantity_on_hand REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL, -- restock | usage | adjustment | waste
    quantity REAL NOT NULL, -- positive = in, negative = out
    reference TEXT, -- e.g. related sale id or PO number
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ PROMOS ============
CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    discount_type TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
    discount_value REAL NOT NULL DEFAULT 0,
    min_spend REAL NOT NULL DEFAULT 0,
    starts_at TEXT,
    ends_at TEXT,
    usage_limit INTEGER,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ SALES MANAGEMENT ============
CREATE TABLE IF NOT EXISTS service_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, -- Wash & Fold, Dry Clean, Wash & Dry, etc.
    unit TEXT NOT NULL DEFAULT 'kg', -- kg, load, piece
    price REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    order_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | washing | ready | claimed | cancelled
    subtotal REAL NOT NULL DEFAULT 0,
    discount_total REAL NOT NULL DEFAULT 0,
    tax_total REAL NOT NULL DEFAULT 0,
    grand_total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | partial | paid
    promo_id INTEGER REFERENCES promos(id) ON DELETE SET NULL,
    drop_off_at TEXT NOT NULL DEFAULT (datetime('now')),
    pickup_due_at TEXT,
    claimed_at TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash', -- cash | gcash | card | bank_transfer
    reference_no TEXT,
    received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ EXPENSES ============
CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE -- utilities, rent, supplies, maintenance, etc.
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL DEFAULT (datetime('now')),
    paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    receipt_ref TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CASHFLOW ============
-- General ledger of all cash in/out, fed by triggers/app logic from sales, expenses, payroll.
CREATE TABLE IF NOT EXISTS cashflow_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL, -- income | expense
    source TEXT NOT NULL, -- sale | expense | payroll | adjustment
    source_id INTEGER, -- FK to orders.id / expenses.id / payroll_runs.id depending on source
    amount REAL NOT NULL,
    description TEXT,
    entry_date TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ PAYROLL ============
CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    position TEXT,
    contact_no TEXT,
    pay_type TEXT NOT NULL DEFAULT 'daily', -- daily | hourly | monthly | per_piece
    rate REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    date_hired TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    work_date TEXT NOT NULL,
    time_in TEXT,
    time_out TEXT,
    hours_worked REAL,
    status TEXT NOT NULL DEFAULT 'present', -- present | absent | leave | half_day
    UNIQUE(worker_id, work_date)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | paid
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    gross_pay REAL NOT NULL DEFAULT 0,
    deductions REAL NOT NULL DEFAULT 0,
    net_pay REAL NOT NULL DEFAULT 0,
    notes TEXT,
    paid_at TEXT
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_branch_date ON cashflow_entries(branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);

-- ============ SEED DATA ============
INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'Main Branch');
INSERT OR IGNORE INTO service_types (id, name, unit, price) VALUES
    (1, 'Wash & Fold', 'kg', 45.0),
    (2, 'Wash & Dry', 'kg', 60.0),
    (3, 'Dry Clean', 'piece', 150.0),
    (4, 'Comforter/Blanket', 'piece', 250.0);
INSERT OR IGNORE INTO expense_categories (id, name) VALUES
    (1, 'Utilities'), (2, 'Rent'), (3, 'Supplies'), (4, 'Maintenance'), (5, 'Other');
