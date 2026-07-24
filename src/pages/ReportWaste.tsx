import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import type { MovementType } from "../types";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface WasteRow {
  item_id: number;
  name: string;
  unit: string;
  movement_type: MovementType;
  quantity: number;
  value: number;
}

export default function ReportWaste() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<WasteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["m.movement_type IN ('waste', 'adjustment')"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(m.created_at,1,10) >= ?", "substr(m.created_at,1,10) <= ?");
      params.push(range.from, range.to);
    }

    setLoading(true);
    select<WasteRow>(
      `SELECT m.item_id, i.name, i.unit, m.movement_type,
              SUM(ABS(m.quantity)) AS quantity,
              SUM(ABS(m.quantity) * COALESCE(m.unit_price, b.unit_price, 0)) AS value
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.item_id
       LEFT JOIN inventory_movements b ON b.id = m.consumed_from_movement_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY m.item_id, m.movement_type
       ORDER BY value DESC`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Waste & shrinkage</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-red-600 to-red-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <Trash2 size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{totalValue.toFixed(2)}</p>
        <p className="text-xs text-white/70">Lost to waste/adjustments this period</p>
      </div>

      {!loading && rows.length === 0 && (
        <EmptyState text="No waste or adjustment movements recorded in this period. Note: there's currently no screen in the app to log a waste/adjustment movement — this report will stay empty until that's added." />
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <ListRow
            key={`${r.item_id}-${r.movement_type}`}
            to={`/inventory/${r.item_id}`}
            icon={Trash2}
            title={r.name}
            subtitle={`${r.movement_type === "waste" ? "Waste" : "Adjustment"} · ${r.quantity} ${r.unit}`}
            value={`₱${r.value.toFixed(2)}`}
            valueClassName="text-red-500"
          />
        ))}
      </ul>
    </div>
  );
}
