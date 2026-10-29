import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet, Search, BarChart3, TrendingUp, Receipt } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";
import PeriodFilter from "../components/PeriodFilter";

interface ExpenseRow {
  kind: "expense" | "restock";
  ref_id: number;
  description: string;
  category_name: string | null;
  amount: number;
  expense_date: string;
}

// Merges manual expenses with restocked inventory cost (grouped per purchase + usage_type, so a
// mixed receipt shows as at most two rows here) -- otherwise restock spend (often most of a
// laundry shop's cost) would never appear on this page at all. See ReportExpenseCategories for
// the category-breakdown version of the same merge. `kind`/`ref_id` say where a row's "view
// details" link should go: a real expenses.id, or the inventory_purchases.id it was rolled up from
// (there's no single expenses row for a restock's item lines to link to).
const EXPENSES_QUERY = `
  SELECT 'expense' AS kind, e.id AS ref_id, e.description AS description, c.name AS category_name, e.amount AS amount, e.expense_date AS expense_date
  FROM expenses e
  LEFT JOIN expense_categories c ON c.id = e.category_id
  WHERE e.voided_at IS NULL
  UNION ALL
  SELECT
    'restock' AS kind,
    m.purchase_id AS ref_id,
    'Restock' || COALESCE(' — ' || p.supplier, '') AS description,
    CASE i.usage_type WHEN 'supply' THEN 'Business Supply' ELSE 'POS Consumption' END AS category_name,
    SUM(m.quantity * COALESCE(m.unit_price, 0)) AS amount,
    COALESCE(p.purchase_date, date(m.created_at)) AS expense_date
  FROM inventory_movements m
  JOIN inventory_items i ON i.id = m.item_id
  LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
  WHERE m.movement_type = 'restock' AND p.voided_at IS NULL
  GROUP BY m.purchase_id, i.usage_type
  ORDER BY expense_date DESC
`;

export default function Expenses() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    select<ExpenseRow>(EXPENSES_QUERY).then(setExpenses);
  }, []);

  const inPeriod = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) return expenses;
    return expenses.filter((e) => {
      const d = e.expense_date.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [expenses, period, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inPeriod;
    return inPeriod.filter(
      (e) => e.description.toLowerCase().includes(q) || (e.category_name ?? "").toLowerCase().includes(q),
    );
  }, [inPeriod, searchQuery]);

  const stats = useMemo(() => {
    const total = inPeriod.reduce((s, e) => s + e.amount, 0);
    const count = inPeriod.length;
    const average = count > 0 ? total / count : 0;
    const top = inPeriod.reduce<ExpenseRow | null>((max, e) => (!max || e.amount > max.amount ? e : max), null);
    return { total, count, average, top };
  }, [inPeriod]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Expenses" />
        <Link
          to="/expenses/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="New expense"
        >
          <Plus size={18} strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{stats.total.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Total</p>
          <p className="truncate text-[8px] text-white/60">
            {stats.count} expense{stats.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <BarChart3 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{stats.average.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Average</p>
          <p className="truncate text-[8px] font-semibold text-blue-600">per expense</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <TrendingUp size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{(stats.top?.amount ?? 0).toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Top expense</p>
          <p className="truncate text-[8px] font-semibold text-amber-600">{stats.top?.description ?? "—"}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <Receipt size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.count}</p>
          <p className="truncate text-[9px] text-ink/50">Transactions</p>
          <p className="truncate text-[8px] font-semibold text-purple-600">this period</p>
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search description or category…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4" />

      {filtered.length === 0 && (
        <EmptyState text={expenses.length === 0 ? "No expenses yet." : "No expenses match your filters."} />
      )}

      <ul className="space-y-2">
        {filtered.map((e) => (
          <ListRow
            key={`${e.kind}-${e.ref_id}-${e.category_name}`}
            to={e.kind === "expense" ? `/expenses/${e.ref_id}` : `/inventory/purchases/${e.ref_id}`}
            icon={Wallet}
            title={e.description}
            subtitle={`${e.category_name ?? "Uncategorized"} · ${e.expense_date.slice(0, 10)}`}
            value={`₱${e.amount.toFixed(2)}`}
            valueClassName="text-red-500"
          />
        ))}
      </ul>
    </div>
  );
}
