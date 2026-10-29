import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, PieChart, Wallet } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface CategoryRow {
  category_name: string | null;
  total: number;
  count: number;
}

// Merges manual expenses with restocked inventory cost, so a category breakdown reflects real
// money out (detergent/supplies bought via Restock) instead of only manually-entered expenses.
// Restock lines don't have an expense_categories row -- they're labeled by each item's usage_type
// instead (POS Consumption / Business Supply), same split used on the item and Restock forms.
const COMBINED_QUERY = `
  SELECT category_name, SUM(amount) AS total, COUNT(*) AS count
  FROM (
    SELECT c.name AS category_name, e.amount AS amount, date(e.expense_date) AS entry_date
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.voided_at IS NULL
    UNION ALL
    SELECT
      CASE i.usage_type WHEN 'supply' THEN 'Business Supply' ELSE 'POS Consumption' END AS category_name,
      m.quantity * COALESCE(m.unit_price, 0) AS amount,
      date(COALESCE(p.purchase_date, m.created_at)) AS entry_date
    FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.item_id
    LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
    WHERE m.movement_type = 'restock' AND p.voided_at IS NULL
  ) combined
  {where}
  GROUP BY category_name
  ORDER BY total DESC
`;

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
      conditions.push("entry_date >= ?", "entry_date <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<CategoryRow>(COMBINED_QUERY.replace("{where}", where), params).then((r) => {
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
              key={r.category_name ?? "uncategorized"}
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
