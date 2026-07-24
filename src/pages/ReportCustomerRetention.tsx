import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, UserPlus, Repeat } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface SegmentRow {
  segment: "new" | "returning";
  customers: number;
  orders: number;
  total: number;
}

export default function ReportCustomerRetention() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [noRange, setNoRange] = useState(false);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) {
      setNoRange(true);
      setRows([]);
      return;
    }
    setNoRange(false);
    setLoading(true);
    select<SegmentRow>(
      `WITH first_orders AS (
         SELECT customer_id, MIN(drop_off_at) AS first_date
         FROM orders
         WHERE customer_id IS NOT NULL
         GROUP BY customer_id
       )
       SELECT
         CASE WHEN substr(fo.first_date,1,10) >= ? THEN 'new' ELSE 'returning' END AS segment,
         COUNT(DISTINCT o.customer_id) AS customers,
         COUNT(*) AS orders,
         SUM(o.grand_total) AS total
       FROM orders o
       JOIN first_orders fo ON fo.customer_id = o.customer_id
       WHERE substr(o.drop_off_at,1,10) >= ? AND substr(o.drop_off_at,1,10) <= ?
       GROUP BY segment`,
      [range.from, range.from, range.to],
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const newRow = rows.find((r) => r.segment === "new");
  const returningRow = rows.find((r) => r.segment === "returning");

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">New vs. returning customers</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {noRange && <EmptyState text="Pick a from/to date to see this report." />}
      {!noRange && !loading && rows.length === 0 && <EmptyState text="No customer orders in this period." />}

      {!noRange && (
        <ul className="space-y-2">
          <ListRow
            icon={UserPlus}
            iconClassName="bg-emerald-100 text-emerald-600"
            title="New customers"
            subtitle={`${newRow?.customers ?? 0} customer${(newRow?.customers ?? 0) === 1 ? "" : "s"} · ${newRow?.orders ?? 0} order${(newRow?.orders ?? 0) === 1 ? "" : "s"} · first order fell in this period`}
            value={`₱${(newRow?.total ?? 0).toFixed(2)}`}
          />
          <ListRow
            icon={Repeat}
            iconClassName="bg-blue-100 text-blue-600"
            title="Returning customers"
            subtitle={`${returningRow?.customers ?? 0} customer${(returningRow?.customers ?? 0) === 1 ? "" : "s"} · ${returningRow?.orders ?? 0} order${(returningRow?.orders ?? 0) === 1 ? "" : "s"} · ordered before this period too`}
            value={`₱${(returningRow?.total ?? 0).toFixed(2)}`}
          />
        </ul>
      )}
    </div>
  );
}
