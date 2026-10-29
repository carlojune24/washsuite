import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { execute, select, toEntryTimestamp } from "../lib/db";
import type { InventoryPurchase } from "../types";

interface LineRow {
  id: number;
  item_id: number;
  quantity: number;
  quantity_remaining: number | null;
  unit_price: number | null;
  item_name: string;
  item_unit: string;
}

interface LineForm {
  quantity: string;
  price: string;
  consumed: number;
}

export default function InventoryPurchaseEditForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [purchaseDate, setPurchaseDate] = useState("");
  const [origDate, setOrigDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<number, LineForm>>({});
  const [lineMeta, setLineMeta] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      select<InventoryPurchase>("SELECT * FROM inventory_purchases WHERE id = ?", [id]),
      select<LineRow>(
        `SELECT m.id, m.item_id, m.quantity, m.quantity_remaining, m.unit_price, i.name AS item_name, i.unit AS item_unit
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.item_id
         WHERE m.purchase_id = ?
         ORDER BY i.name`,
        [id],
      ),
    ]).then(([[p], m]) => {
      if (p) {
        setPurchaseDate(p.purchase_date);
        setOrigDate(p.purchase_date);
        setSupplier(p.supplier ?? "");
        setReference(p.reference ?? "");
        setNotes(p.notes ?? "");
      }
      setLineMeta(m);
      const initial: Record<number, LineForm> = {};
      for (const l of m) {
        initial[l.id] = {
          quantity: String(l.quantity),
          price: String(l.unit_price ?? 0),
          consumed: l.quantity - (l.quantity_remaining ?? 0),
        };
      }
      setLines(initial);
      setLoading(false);
    });
  }, [id]);

  function updateLine(movementId: number, patch: Partial<LineForm>) {
    setLines((prev) => ({ ...prev, [movementId]: { ...prev[movementId], ...patch } }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!purchaseDate) {
      setError("Enter the restock date.");
      return;
    }
    for (const l of lineMeta) {
      const line = lines[l.id];
      const newQty = Number(line.quantity);
      if (!(newQty >= 0)) {
        setError(`${l.item_name}: enter a valid quantity.`);
        return;
      }
      if (newQty < line.consumed) {
        setError(
          `${l.item_name}: can't reduce below ${line.consumed} ${l.item_unit} — that much has already been used from this batch.`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      await execute(
        `UPDATE inventory_purchases SET purchase_date = ?, supplier = ?, reference = ?, notes = ? WHERE id = ?`,
        [purchaseDate, supplier.trim() || null, reference.trim() || null, notes.trim() || null, id],
      );

      for (const l of lineMeta) {
        const line = lines[l.id];
        const newQty = Number(line.quantity);
        const newPrice = Number(line.price) || 0;
        const delta = newQty - l.quantity;

        await execute(
          `UPDATE inventory_movements SET quantity = ?, quantity_remaining = quantity_remaining + ?, unit_price = ? WHERE id = ?`,
          [newQty, delta, newPrice, l.id],
        );
        if (delta !== 0) {
          await execute(
            `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE id = ?`,
            [delta, l.item_id],
          );
        }
      }

      // Keep the restock's single cashflow entry in step with the edited quantities/prices.
      const [{ total }] = await select<{ total: number }>(
        `SELECT COALESCE((SELECT SUM(quantity * COALESCE(unit_price, 0)) FROM inventory_movements WHERE purchase_id = ?1), 0)
              + COALESCE((SELECT SUM(amount) FROM expenses WHERE purchase_id = ?1 AND voided_at IS NULL), 0) AS total`,
        [id],
      );
      await execute(
        "UPDATE cashflow_entries SET amount = ?, description = ? WHERE source = 'restock' AND source_id = ?",
        [total, supplier.trim() ? `Restock — ${supplier.trim()}` : "Restock", id],
      );
      if (purchaseDate !== origDate) {
        await execute("UPDATE cashflow_entries SET entry_date = ? WHERE source = 'restock' AND source_id = ?", [
          toEntryTimestamp(purchaseDate),
          id,
        ]);
      }

      navigate(`/inventory/purchases/${id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={`/inventory/purchases/${id}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Edit restock</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Quantity &amp; price
          </p>
          <div className="flex items-center gap-2 px-3 text-[10px] font-semibold tracking-wide text-ink/35 uppercase">
            <span className="flex-1">Item</span>
            <span className="w-16 text-center">Qty</span>
            <span className="w-16 text-center">Price</span>
          </div>
          <div className="mt-1 space-y-1.5">
            {lineMeta.map((l) => {
              const line = lines[l.id];
              return (
                <div key={l.id} className="rounded-xl bg-surface p-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.item_name}</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                      className="w-16 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.price}
                      onChange={(e) => updateLine(l.id, { price: e.target.value })}
                      className="w-16 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                  </div>
                  {line.consumed > 0 && (
                    <p className="mt-1 text-[11px] text-ink/40">
                      {line.consumed} {l.item_unit} already used from this batch — quantity can't go below that.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Date</span>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Supplier</span>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g. ABC Trading"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Receipt / reference #</span>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. OR #1234"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
