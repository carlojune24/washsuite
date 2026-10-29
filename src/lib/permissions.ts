/**
 * Canonical list of permission-gated "business menu" pages — the same keys tag routes (App.tsx),
 * Dashboard tiles/quick actions, bottom-nav tabs, and the Manager/Staff permission checkboxes.
 * Dashboard/Home and Settings (Appearance/Logout) are always accessible to every role and are
 * deliberately not part of this list; Users management is hardcoded Owner-only for the same reason.
 *
 * Most entries gate a whole route, but a few (e.g. "attendance_clockout") gate a specific action
 * inside an already-accessible page instead of a route of their own — hasAccess() works the same
 * either way, they just aren't wired to a <Protected pageKey="..."> route.
 */
export const PAGE_MODULES = [
  { key: "sales", label: "Sales" },
  { key: "customers", label: "Customers" },
  { key: "inventory", label: "Stock / Inventory" },
  { key: "restock_edit", label: "Restock – Edit" },
  { key: "restock_rollback", label: "Restock – Rollback" },
  { key: "services", label: "Services" },
  { key: "packages", label: "Packages" },
  { key: "addons", label: "Add-ons" },
  { key: "promos", label: "Promos" },
  { key: "expenses", label: "Expenses" },
  { key: "expense_void", label: "Expenses – Void" },
  { key: "restock_void", label: "Restock – Void" },
  { key: "cashflow", label: "Cashflow" },
  { key: "adjustment_rollback", label: "Cashflow – Rollback Adjustment" },
  { key: "attendance", label: "Attendance" },
  { key: "attendance_clockout", label: "Attendance – Clock Out" },
  { key: "cash_advances", label: "Cash Advances" },
  { key: "deductions", label: "Deductions" },
  { key: "payroll", label: "Payroll" },
  { key: "employees", label: "Employees" },
  { key: "reports", label: "Reports" },
] as const;

export type PageKey = (typeof PAGE_MODULES)[number]["key"];
