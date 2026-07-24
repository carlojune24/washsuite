import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Wallet } from "lucide-react";
import { select, formatDateTime } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import type { PaymentStatus } from "../types";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};

const STATUS_COLOR: Record<PaymentStatus, string> = {
  unpaid: "bg-red-100 text-red-600",
  partial: "bg-amber-100 text-amber-600",
  paid: "bg-emerald-100 text-emerald-600",
};

interface UnpaidOrderRow {
  id: number;
  order_number: string;
  grand_total: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  drop_off_at: string;
  customer_name: string | null;
}

export default function ReportUnpaidOrders() {
  const [period, setPeriod] = useState<Period>("custom");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<UnpaidOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["o.payment_status != 'paid'", "o.status != 'cancelled'"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(o.drop_off_at,1,10) >= ?", "substr(o.drop_off_at,1,10) <= ?");
      params.push(range.from, range.to);
    }

    setLoading(true);
    select<UnpaidOrderRow>(
      `SELECT o.id, o.order_number, o.grand_total, o.amount_paid, o.payment_status, o.drop_off_at,
              c.full_name AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY o.drop_off_at ASC`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const totalOutstanding = rows.reduce((s, r) => s + (r.grand_total - r.amount_paid), 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Unpaid orders</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <Wallet size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{totalOutstanding.toFixed(2)}</p>
        <p className="text-xs text-white/70">
          Outstanding across {rows.length} order{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No unpaid or partially paid orders." />}

      <ul className="space-y-2">
        {rows.map((r) => {
          const balance = r.grand_total - r.amount_paid;
          return (
            <ListRow
              key={r.id}
              to={`/sales/${r.id}`}
              icon={Wallet}
              iconClassName={STATUS_COLOR[r.payment_status]}
              title={r.customer_name ?? "Walk-in"}
              subtitle={`${r.order_number} · ${STATUS_LABEL[r.payment_status]} · ${formatDateTime(r.drop_off_at)}`}
              value={`₱${balance.toFixed(2)}`}
            />
          );
        })}
      </ul>
    </div>
  );
}
