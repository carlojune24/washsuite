import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, TrendingUp } from "lucide-react";
import { select } from "../lib/db";
import { EmptyState } from "../components/ListRow";

interface MonthRow {
  month: string;
  total: number;
  count: number;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" });
}

export default function ReportExpenseTrend() {
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Merges manual expenses with restocked inventory cost -- see ReportExpenseCategories for why
    // (restock spend otherwise never shows up here at all).
    select<MonthRow>(
      `SELECT strftime('%Y-%m', entry_date) AS month, SUM(amount) AS total, COUNT(*) AS count
       FROM (
         SELECT date(e.expense_date) AS entry_date, e.amount AS amount
         FROM expenses e
         UNION ALL
         SELECT date(COALESCE(p.purchase_date, m.created_at)) AS entry_date, m.quantity * COALESCE(m.unit_price, 0) AS amount
         FROM inventory_movements m
         LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
         WHERE m.movement_type = 'restock'
       ) combined
       WHERE entry_date >= date('now', '-12 months')
       GROUP BY month
       ORDER BY month`,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  const maxTotal = Math.max(0, ...rows.map((r) => r.total));
  const average = rows.length > 0 ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Expense trend</h1>
      </div>

      <p className="mb-3 px-1 text-[11px] text-ink/40">Trailing 12 months.</p>

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <TrendingUp size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{average.toFixed(2)}</p>
        <p className="text-xs text-white/70">Average per month</p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No expenses recorded in the last 12 months." />}

      <div className="space-y-2 rounded-2xl bg-surface p-3.5 shadow-sm">
        {rows.map((r) => {
          const pct = maxTotal > 0 ? (r.total / maxTotal) * 100 : 0;
          return (
            <div key={r.month} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-xs text-ink/50">{monthLabel(r.month)}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold text-ink">₱{r.total.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
