import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet, Search, BarChart3, TrendingUp, Receipt } from "lucide-react";
import { select } from "../lib/db";
import type { Expense } from "../types";
import { type Period, periodRange } from "../lib/period";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";
import PeriodFilter from "../components/PeriodFilter";

interface ExpenseRow extends Expense {
  category_name: string | null;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    select<ExpenseRow>(
      `SELECT e.*, c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       ORDER BY e.expense_date DESC`,
    ).then(setExpenses);
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
            key={e.id}
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
