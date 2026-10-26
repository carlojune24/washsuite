import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { History, Package, PackagePlus, Plus, Search, X } from "lucide-react";
import { select } from "../lib/db";
import type { InventoryItem } from "../types";
import { retailPrice } from "../lib/pricing";
import { doseFallbackLabel } from "../lib/dose";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

interface ItemRow extends InventoryItem {
  current_cost: number | null;
}

export default function Inventory() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const lowOnly = searchParams.get("low") === "1";

  useEffect(() => {
    select<ItemRow>(
      `SELECT i.*,
              (SELECT m.unit_price FROM inventory_movements m
               WHERE m.item_id = i.id AND m.movement_type = 'restock' AND m.quantity_remaining > 0
               ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS current_cost
       FROM inventory_items i
       WHERE i.is_active = 1
       ORDER BY i.name`,
    ).then(setItems);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = items;
    if (lowOnly) rows = rows.filter((it) => it.quantity_on_hand <= it.reorder_level);
    if (q) {
      rows = rows.filter(
        (it) => it.name.toLowerCase().includes(q) || (it.description ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [items, query, lowOnly]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <PageHeading title="Inventory" hint="Detergent, fabric conditioner, packaging, and more." />
        <Link
          to="/inventory/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add item"
        >
          <Plus size={18} strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          to="/inventory/purchases"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-xs font-semibold text-brand-600 shadow-sm"
        >
          <History size={14} strokeWidth={2.2} />
          Restock history
        </Link>
        <Link
          to="/inventory/restock"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-xs font-semibold text-brand-600 shadow-sm"
        >
          <PackagePlus size={14} strokeWidth={2.2} />
          Restock
        </Link>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

      {lowOnly && (
        <div className="mb-4 flex items-center gap-1.5 rounded-full bg-amber-100 py-1.5 pr-1.5 pl-3 text-xs font-medium text-amber-700 w-fit">
          Low stock only
          <Link
            to="/inventory"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200/70"
            aria-label="Clear filter"
          >
            <X size={12} strokeWidth={2.6} />
          </Link>
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState
          text={
            items.length === 0
              ? "No inventory items yet."
              : lowOnly
                ? "No items are low on stock right now."
                : "No items match your search."
          }
        />
      )}

      <ul className="space-y-2">
        {filtered.map((it) => {
          const low = it.quantity_on_hand <= it.reorder_level;
          const retail = it.current_cost != null ? retailPrice(it.current_cost, it) : null;
          const doseCount = it.dose_size > 0 ? Math.floor(it.quantity_on_hand / it.dose_size) : null;
          const doseNote =
            doseCount != null ? ` (≈${doseCount} × ${it.dose_label || doseFallbackLabel(it.dose_size, it.unit)})` : "";
          return (
            <ListRow
              key={it.id}
              to={`/inventory/${it.id}`}
              icon={Package}
              iconClassName={low ? "bg-amber-100 text-amber-600" : undefined}
              title={it.name}
              subtitle={`${it.quantity_on_hand} ${it.unit} on hand${doseNote}${low ? " · Low stock" : ""}${it.usage_type === "supply" ? " · Supply" : ""}`}
              value={retail != null ? `₱${retail.toFixed(2)}` : "—"}
            />
          );
        })}
      </ul>
    </div>
  );
}
