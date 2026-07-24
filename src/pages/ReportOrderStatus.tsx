import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ListChecks } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import type { OrderStatus } from "../types";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Received",
  ready: "Ready",
  claimed: "Claimed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-600",
  ready: "bg-blue-100 text-blue-600",
  claimed: "bg-purple-100 text-purple-600",
  delivered: "bg-emerald-100 text-emerald-600",
  cancelled: "bg-red-100 text-red-600",
};

interface StatusRow {
  status: OrderStatus;
  count: number;
  total: number;
}

export default function ReportOrderStatus() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(drop_off_at,1,10) >= ?", "substr(drop_off_at,1,10) <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<StatusRow>(
      `SELECT status, COUNT(*) AS count, SUM(grand_total) AS total
       FROM orders
       ${where}
       GROUP BY status`,
      params,
    ).then((r) => {
      const order: OrderStatus[] = ["pending", "ready", "claimed", "delivered", "cancelled"];
      setRows(r.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)));
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Order status breakdown</h1>
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
          <ListChecks size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">{totalCount}</p>
        <p className="text-xs text-white/70">Total orders this period</p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No orders in this period." />}

      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = totalCount > 0 ? (r.count / totalCount) * 100 : 0;
          return (
            <ListRow
              key={r.status}
              icon={ListChecks}
              iconClassName={STATUS_COLOR[r.status]}
              title={STATUS_LABEL[r.status]}
              subtitle={`${r.count} order${r.count === 1 ? "" : "s"} · ${pct.toFixed(0)}% of total`}
              value={`₱${r.total.toFixed(2)}`}
            />
          );
        })}
      </ul>
    </div>
  );
}
