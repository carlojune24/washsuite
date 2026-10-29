import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Pencil,
  PackagePlus,
  Boxes,
  Tag,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  SlidersHorizontal,
} from "lucide-react";
import { select } from "../lib/db";
import type { InventoryItem, InventoryMovement, MovementType } from "../types";
import { retailPrice } from "../lib/pricing";
import { doseFallbackLabel } from "../lib/dose";
import { EmptyState } from "../components/ListRow";

const MOVEMENT_LABEL: Record<MovementType, string> = {
  restock: "Restock",
  usage: "Used",
  adjustment: "Adjustment",
  waste: "Waste",
};

const MOVEMENT_ICON: Record<MovementType, typeof ArrowUpCircle> = {
  restock: ArrowUpCircle,
  usage: ArrowDownCircle,
  adjustment: SlidersHorizontal,
  waste: ArrowDownCircle,
};

interface MovementRow extends InventoryMovement {
  purchase_supplier: string | null;
  purchase_receipt_image: string | null;
}

interface BatchRow {
  id: number;
  quantity: number;
  quantity_remaining: number;
  unit_price: number | null;
  created_at: string;
  purchase_supplier: string | null;
}

export default function InventoryItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      select<InventoryItem>("SELECT * FROM inventory_items WHERE id = ?", [id]),
      select<MovementRow>(
        `SELECT m.*, p.supplier AS purchase_supplier, p.receipt_image AS purchase_receipt_image
         FROM inventory_movements m
         LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
         WHERE m.item_id = ?
         ORDER BY m.created_at DESC`,
        [id],
      ),
      select<BatchRow>(
        `SELECT m.id, m.quantity, m.quantity_remaining, m.unit_price, m.created_at, p.supplier AS purchase_supplier
         FROM inventory_movements m
         LEFT JOIN inventory_purchases p ON p.id = m.purchase_id
         WHERE m.item_id = ? AND m.movement_type = 'restock' AND m.quantity_remaining > 0
         ORDER BY m.created_at ASC, m.id ASC`,
        [id],
      ),
    ]).then(([[it], m, b]) => {
      setItem(it ?? null);
      setMovements(m);
      setBatches(b);
      setSelectedBatchId(b[0]?.id ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!item) {
    return <p className="py-10 text-center text-sm text-ink/40">Item not found.</p>;
  }

  const low = item.quantity_on_hand <= item.reorder_level;
  const activeBatch = batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null;
  const currentCost = activeBatch?.unit_price ?? null;
  const currentRetail = currentCost != null ? retailPrice(currentCost, item) : null;
  const margin = currentCost != null && currentRetail != null ? currentRetail - currentCost : null;
  const isViewingFifoBatch = activeBatch != null && activeBatch.id === batches[0]?.id;

  return (
    <div className="md:flex md:h-full md:flex-col">
      <div className="md:shrink-0">
        <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
          <Link
            to="/inventory"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
          >
            <ChevronLeft size={18} strokeWidth={2.2} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-ink">{item.name}</h1>
          <Link
            to={`/inventory/${item.id}/edit`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Edit item"
          >
            <Pencil size={16} strokeWidth={2.2} />
          </Link>
        </div>

        {item.description && <p className="mb-4 px-1 text-sm text-ink/60">{item.description}</p>}

        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat icon={Boxes} label={`On hand (${item.unit})`} value={item.quantity_on_hand} warn={low} />
          <Stat icon={Tag} label="Cost (this batch)" value={currentCost != null ? `₱${currentCost.toFixed(2)}` : "—"} />
          <Stat
            icon={TrendingUp}
            label="Retail (this batch)"
            value={currentRetail != null ? `₱${currentRetail.toFixed(2)}` : "—"}
          />
        </div>

        {item.dose_size > 0 && (
          <p className="mb-4 px-1 text-xs text-ink/40">
            ≈{Math.floor(item.quantity_on_hand / item.dose_size)} × {item.dose_label || doseFallbackLabel(item.dose_size, item.unit)}{" "}
            remaining
          </p>
        )}

        {low && (
          <p className="mb-4 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-700">
            Low stock — at or below the reorder level of {item.reorder_level} {item.unit}.
          </p>
        )}
        {currentCost == null ? (
          <p className="mb-4 px-1 text-xs text-ink/40">
            No cost yet — restock this item to bring in the first batch and set its price.
          </p>
        ) : (
          <div className="mb-4 space-y-1 px-1">
            {margin != null && (
              <p className="text-xs text-ink/40">
                Margin: ₱{margin.toFixed(2)} per {item.unit} (
                {item.markup_type === "fixed" ? `+₱${item.markup_amount} fixed markup` : `${item.markup_percent}% markup on cost`})
              </p>
            )}
            {!isViewingFifoBatch && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                Viewing a batch that isn't next in line —{" "}
                <button type="button" onClick={() => setSelectedBatchId(batches[0]?.id ?? null)} className="underline">
                  view the active batch instead
                </button>
              </p>
            )}
          </div>
        )}

        <Link
          to={`/inventory/restock?item=${item.id}`}
          className="mb-6 flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm"
        >
          <PackagePlus size={17} strokeWidth={2.2} />
          Restock
        </Link>

        {batches.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
              Cost batches (FIFO — oldest consumed first)
            </p>
            <div className="space-y-1.5">
              {batches.map((b, i) => {
                const selected = b.id === selectedBatchId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(b.id)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 text-left shadow-sm ring-2 transition-colors " +
                      (selected ? "ring-brand-500" : "ring-transparent")
                    }
                  >
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                        (i === 0 ? "bg-brand-500 text-white" : "bg-brand-200/50 text-brand-600")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {b.quantity_remaining} of {b.quantity} {item.unit} left
                        {i === 0 && <span className="ml-1.5 text-[10px] font-medium text-brand-500">NEXT TO USE</span>}
                      </p>
                      <p className="truncate text-xs text-ink/50">
                        {b.created_at}
                        {b.purchase_supplier ? ` · ${b.purchase_supplier}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-ink">
                      ₱{(b.unit_price ?? 0).toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <p className="mb-2 shrink-0 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Stock history</p>

        {movements.length === 0 && <EmptyState text="No stock movements yet." />}

        <ul className="space-y-2 pb-1 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-0.5">
          {movements.map((m) => {
            const Icon = MOVEMENT_ICON[m.movement_type];
            const rowContent = (
              <>
                {m.purchase_receipt_image ? (
                  <img
                    src={m.purchase_receipt_image}
                    alt="Receipt"
                    className="h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {MOVEMENT_LABEL[m.movement_type]}
                    {m.purchase_supplier ? ` · ${m.purchase_supplier}` : m.reference ? ` · ${m.reference}` : ""}
                  </p>
                  <p className="truncate text-xs text-ink/50">{m.created_at}</p>
                </div>
                <span
                  className={"shrink-0 text-sm font-semibold " + (m.quantity >= 0 ? "text-emerald-600" : "text-red-500")}
                >
                  {m.quantity >= 0 ? "+" : ""}
                  {m.quantity} {item.unit}
                </span>
              </>
            );
            const linkTo = m.purchase_id
              ? `/inventory/purchases/${m.purchase_id}`
              : m.order_id
                ? `/sales/${m.order_id}`
                : null;
            return (
              <li key={m.id} className="rounded-2xl bg-surface shadow-sm">
                {linkTo ? (
                  <Link
                    to={linkTo}
                    className="flex items-center gap-3 p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  >
                    {rowContent}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 p-3.5">{rowContent}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
      <span
        className={
          "mb-2 flex h-8 w-8 items-center justify-center rounded-xl " +
          (warn ? "bg-amber-100 text-amber-600" : "bg-brand-200/50 text-brand-600")
        }
      >
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink/50">{label}</p>
    </div>
  );
}
