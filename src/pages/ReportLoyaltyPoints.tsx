import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Gift, Coins } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface EventRow {
  type: "earn" | "redeem";
  total_points: number;
  event_count: number;
}

export default function ReportLoyaltyPoints() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(created_at,1,10) >= ?", "substr(created_at,1,10) <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<EventRow>(
      `SELECT type, SUM(points) AS total_points, COUNT(*) AS event_count
       FROM loyalty_point_events
       ${where}
       GROUP BY type`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const earned = rows.find((r) => r.type === "earn");
  const redeemed = rows.find((r) => r.type === "redeem");
  const net = (earned?.total_points ?? 0) + (redeemed?.total_points ?? 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Loyalty points issued vs. redeemed</h1>
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
          <Coins size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">
          {net >= 0 ? "+" : ""}
          {net.toLocaleString()} pts
        </p>
        <p className="text-xs text-white/70">Net points outstanding change this period</p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No loyalty activity in this period." />}

      <ul className="space-y-2">
        <ListRow
          icon={Gift}
          iconClassName="bg-emerald-100 text-emerald-600"
          title="Points earned"
          subtitle={`${earned?.event_count ?? 0} order${(earned?.event_count ?? 0) === 1 ? "" : "s"}`}
          value={`+${(earned?.total_points ?? 0).toLocaleString()} pts`}
          valueClassName="text-emerald-600"
        />
        <ListRow
          icon={Gift}
          iconClassName="bg-red-100 text-red-600"
          title="Points redeemed"
          subtitle={`${redeemed?.event_count ?? 0} order${(redeemed?.event_count ?? 0) === 1 ? "" : "s"}`}
          value={`${(redeemed?.total_points ?? 0).toLocaleString()} pts`}
          valueClassName="text-red-500"
        />
      </ul>
    </div>
  );
}
