import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, PackagePlus, Truck, Package } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface SupplierRow {
  supplier: string;
  total: number;
  count: number;
}

interface ItemRow {
  item_id: number;
  name: string;
  total: number;
  quantity: number;
}

export default function ReportRestockSpend() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bySupplier, setBySupplier] = useState<SupplierRow[]>([]);
  const [byItem, setByItem] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["m.movement_type = 'restock'", "p.voided_at IS NULL"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(m.created_at,1,10) >= ?", "substr(m.created_at,1,10) <= ?");
      params.push(range.from, range.to);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    setLoading(true);
    Promise.all([
      select<SupplierRow>(
        `SELECT COALESCE(p.supplier, 'Unspecified') AS supplier, SUM(m.quantity * m.unit_price) AS total, COUNT(*) AS count
         FROM inventory_movements m
         LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
         ${where}
         GROUP BY supplier
         ORDER BY total DESC`,
        params,
      ),
      select<ItemRow>(
        `SELECT m.item_id, i.name, SUM(m.quantity * m.unit_price) AS total, SUM(m.quantity) AS quantity
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.item_id
         LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
         ${where}
         GROUP BY m.item_id
         ORDER BY total DESC
         LIMIT 10`,
        params,
      ),
    ]).then(([sup, item]) => {
      setBySupplier(sup);
      setByItem(item);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const grandTotal = bySupplier.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Restock spend</h1>
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
          <PackagePlus size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{grandTotal.toFixed(2)}</p>
        <p className="text-xs text-white/70">Total restock spend this period</p>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">By supplier</p>
      {!loading && bySupplier.length === 0 && <EmptyState text="No restocks in this period." />}
      <ul className="mb-6 space-y-2">
        {bySupplier.map((r) => (
          <ListRow
            key={r.supplier}
            icon={Truck}
            title={r.supplier}
            subtitle={`${r.count} restock${r.count === 1 ? "" : "s"}`}
            value={`₱${r.total.toFixed(2)}`}
          />
        ))}
      </ul>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Top items restocked</p>
      {!loading && byItem.length === 0 && <EmptyState text="No restocks in this period." />}
      <ul className="space-y-2">
        {byItem.map((r) => (
          <ListRow
            key={r.item_id}
            icon={Package}
            title={r.name}
            subtitle={`${r.quantity} restocked`}
            value={`₱${r.total.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
