import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Boxes } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface UsageRow {
  item_id: number;
  name: string;
  unit: string;
  used_qty: number;
  used_cost: number;
}

interface RevenueRow {
  item_id: number;
  revenue: number;
  sold_qty: number;
}

interface ItemSummary {
  item_id: number;
  name: string;
  unit: string;
  used_qty: number;
  used_cost: number;
  revenue: number;
  sold_qty: number;
}

export default function ReportItemUsage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const usageConditions: string[] = ["m.movement_type = 'usage'"];
    const usageParams: unknown[] = [];
    const revenueConditions: string[] = ["oi.item_id IS NOT NULL", "oi.line_total > 0"];
    const revenueParams: unknown[] = [];
    if (range) {
      usageConditions.push("substr(m.created_at,1,10) >= ?", "substr(m.created_at,1,10) <= ?");
      usageParams.push(range.from, range.to);
      revenueConditions.push("substr(o.drop_off_at,1,10) >= ?", "substr(o.drop_off_at,1,10) <= ?");
      revenueParams.push(range.from, range.to);
    }

    setLoading(true);
    Promise.all([
      select<UsageRow>(
        `SELECT m.item_id, i.name, i.unit,
                SUM(ABS(m.quantity)) AS used_qty,
                SUM(ABS(m.quantity) * COALESCE(b.unit_price, 0)) AS used_cost
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.item_id
         LEFT JOIN inventory_movements b ON b.id = m.consumed_from_movement_id
         WHERE ${usageConditions.join(" AND ")}
         GROUP BY m.item_id`,
        usageParams,
      ),
      select<RevenueRow>(
        `SELECT oi.item_id, SUM(oi.line_total) AS revenue, SUM(oi.quantity) AS sold_qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE ${revenueConditions.join(" AND ")}
         GROUP BY oi.item_id`,
        revenueParams,
      ),
    ]).then(([u, r]) => {
      setUsage(u);
      setRevenue(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const summaries = useMemo<ItemSummary[]>(() => {
    const byItem = new Map<number, ItemSummary>();
    for (const u of usage) {
      byItem.set(u.item_id, { ...u, revenue: 0, sold_qty: 0 });
    }
    for (const r of revenue) {
      const existing = byItem.get(r.item_id);
      if (existing) {
        existing.revenue = r.revenue;
        existing.sold_qty = r.sold_qty;
      }
    }
    return [...byItem.values()].sort((a, b) => b.used_cost - a.used_cost);
  }, [usage, revenue]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Item usage & income</h1>
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
        Usage and its cost cover every consumption, including doses bundled into packages. Income is only
        shown for items sold as their own standalone order line — package-bundled consumption has no
        separate price, so it shows usage/cost with no income figure.
      </p>

      {!loading && summaries.length === 0 && <EmptyState text="No item usage in this period." />}

      <ul className="space-y-2">
        {summaries.map((s) => (
          <ListRow
            key={s.item_id}
            icon={Boxes}
            title={s.name}
            subtitle={
              s.revenue > 0
                ? `${s.used_qty} ${s.unit} used · cost ₱${s.used_cost.toFixed(2)} · sold ${s.sold_qty} standalone`
                : `${s.used_qty} ${s.unit} used · cost ₱${s.used_cost.toFixed(2)} · no standalone sales`
            }
            value={s.revenue > 0 ? `₱${s.revenue.toFixed(2)}` : "—"}
            valueClassName={s.revenue > 0 ? "text-emerald-600" : "text-ink/30"}
          />
        ))}
      </ul>
    </div>
  );
}
