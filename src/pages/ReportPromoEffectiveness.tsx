import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Percent } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface PromoRow {
  promo_id: number;
  name: string;
  code: string | null;
  uses: number;
  discount_given: number;
}

export default function ReportPromoEffectiveness() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["o.promo_id IS NOT NULL", "o.status != 'cancelled'"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(o.drop_off_at,1,10) >= ?", "substr(o.drop_off_at,1,10) <= ?");
      params.push(range.from, range.to);
    }

    setLoading(true);
    select<PromoRow>(
      `SELECT o.promo_id, p.name, p.code, COUNT(*) AS uses, SUM(o.discount_total) AS discount_given
       FROM orders o
       JOIN promos p ON p.id = o.promo_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY o.promo_id
       ORDER BY uses DESC`,
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
        <h1 className="text-xl font-semibold text-ink">Promo effectiveness</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <p className="mb-3 px-1 text-[11px] text-ink/40">
        "Discount given" is the order's total discount, which can include a loyalty-points redemption
        stacked on the same order — treat it as an upper bound on what the promo itself cost, not an exact
        figure.
      </p>

      {!loading && rows.length === 0 && <EmptyState text="No promo usage in this period." />}

      <ul className="space-y-2">
        {rows.map((r) => (
          <ListRow
            key={r.promo_id}
            to={`/promos/${r.promo_id}/edit`}
            icon={Percent}
            title={r.name}
            subtitle={`${r.code ? `${r.code} · ` : ""}${r.uses} use${r.uses === 1 ? "" : "s"}`}
            value={`-₱${r.discount_given.toFixed(2)}`}
            valueClassName="text-red-500"
          />
        ))}
      </ul>
    </div>
  );
}
