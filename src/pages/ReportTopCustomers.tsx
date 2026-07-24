import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Star } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface CustomerRow {
  customer_id: number;
  full_name: string;
  total: number;
  order_count: number;
}

export default function ReportTopCustomers() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["o.customer_id IS NOT NULL"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(o.drop_off_at,1,10) >= ?", "substr(o.drop_off_at,1,10) <= ?");
      params.push(range.from, range.to);
    }

    setLoading(true);
    select<CustomerRow>(
      `SELECT o.customer_id, c.full_name, SUM(o.grand_total) AS total, COUNT(*) AS order_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY o.customer_id
       ORDER BY total DESC
       LIMIT 50`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Top customers by spend</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {!loading && rows.length === 0 && <EmptyState text="No customer orders in this period." />}

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <ListRow
            key={r.customer_id}
            to={`/customers/${r.customer_id}`}
            icon={Star}
            iconClassName={i < 3 ? "bg-amber-100 text-amber-600" : undefined}
            title={r.full_name}
            subtitle={`${r.order_count} order${r.order_count === 1 ? "" : "s"}`}
            value={`₱${r.total.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
