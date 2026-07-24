import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Receipt } from "lucide-react";
import { select } from "../lib/db";
import { EmptyState } from "../components/ListRow";

interface PurchaseRow {
  id: number;
  supplier: string | null;
  reference: string | null;
  receipt_image: string | null;
  purchase_date: string;
  item_count: number;
  total_amount: number;
}

export default function InventoryPurchases() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    select<PurchaseRow>(
      `SELECT p.id, p.supplier, p.reference, p.receipt_image, p.purchase_date,
              COUNT(m.id) AS item_count,
              COALESCE(SUM(m.quantity * COALESCE(m.unit_price, 0)), 0) AS total_amount
       FROM inventory_purchases p
       LEFT JOIN inventory_movements m ON m.purchase_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    ).then((rows) => {
      setPurchases(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/inventory"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Restock history</h1>
          <p className="truncate text-xs text-ink/50">Past purchases and receipts</p>
        </div>
      </div>

      {!loading && purchases.length === 0 && <EmptyState text="No restocks recorded yet." />}

      <ul className="space-y-2">
        {purchases.map((p) => (
          <li key={p.id}>
            <Link to={`/inventory/purchases/${p.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              {p.receipt_image ? (
                <img src={p.receipt_image} alt="Receipt" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                  <Receipt size={17} strokeWidth={2.2} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{p.supplier || "Restock"}</p>
                <p className="truncate text-xs text-ink/50">
                  {p.purchase_date} · {p.item_count} item{p.item_count === 1 ? "" : "s"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink">₱{p.total_amount.toFixed(2)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
