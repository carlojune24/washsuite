import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, PieChart, Wallet } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface CategoryRow {
  category_id: number | null;
  category_name: string | null;
  total: number;
  count: number;
}

export default function ReportExpenseCategories() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (range) {
      conditions.push("e.expense_date >= ?", "e.expense_date <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<CategoryRow>(
      `SELECT e.category_id, c.name AS category_name, SUM(e.amount) AS total, COUNT(*) AS count
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       ${where}
       GROUP BY e.category_id
       ORDER BY total DESC`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Expense category breakdown</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <Wallet size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{grandTotal.toFixed(2)}</p>
        <p className="text-xs text-white/70">Total expenses this period</p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No expenses in this period." />}

      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = grandTotal > 0 ? (r.total / grandTotal) * 100 : 0;
          return (
            <ListRow
              key={r.category_id ?? "uncategorized"}
              icon={PieChart}
              title={r.category_name ?? "Uncategorized"}
              subtitle={`${r.count} expense${r.count === 1 ? "" : "s"} · ${pct.toFixed(0)}% of total`}
              value={`₱${r.total.toFixed(2)}`}
            />
          );
        })}
      </ul>
    </div>
  );
}
