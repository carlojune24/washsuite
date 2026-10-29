import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ban, ChevronLeft, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import { useAuth } from "../lib/auth";
import type { InventoryPurchase } from "../types";
import { EmptyState } from "../components/ListRow";

interface LineRow {
  id: number;
  item_id: number;
  quantity: number;
  quantity_remaining: number | null;
  unit_price: number | null;
  item_name: string;
  item_unit: string;
}

interface OtherLineRow {
  id: number;
  description: string;
  amount: number;
  category_name: string | null;
}

export default function InventoryPurchaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasAccess } = useAuth();
  const [purchase, setPurchase] = useState<InventoryPurchase | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [otherLines, setOtherLines] = useState<OtherLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);

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
      select<OtherLineRow>(
        `SELECT e.id, e.description, e.amount, c.name AS category_name
         FROM expenses e
         LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE e.purchase_id = ?
         ORDER BY e.id`,
        [id],
      ),
    ]).then(([[p], m, o]) => {
      setPurchase(p ?? null);
      setLines(m);
      setOtherLines(o);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!purchase) {
    return <p className="py-10 text-center text-sm text-ink/40">Restock not found.</p>;
  }

  const itemsTotal = lines.reduce((sum, l) => sum + l.quantity * (l.unit_price ?? 0), 0);
  const otherTotal = otherLines.reduce((sum, l) => sum + l.amount, 0);
  const total = itemsTotal + otherTotal;
  // Only safe to undo if nothing from any batch in this restock has been drawn on yet —
  // deleting a batch that's already been (partially) consumed would leave usage movements
  // pointing at a batch that no longer exists, and would double-subtract stock that's already
  // been taken out via that consumption.
  const canRollback = lines.length > 0 && lines.every((l) => (l.quantity_remaining ?? 0) === l.quantity);

  function confirmRollback() {
    toast(`Roll back this restock?`, {
      description: canRollback
        ? "Removes it entirely and reverses the stock it added. This can't be undone."
        : "Some of this stock has already been used, so it can't be rolled back.",
      action: canRollback ? { label: "Roll back", onClick: () => rollback() } : undefined,
      cancel: { label: canRollback ? "Cancel" : "OK", onClick: () => {} },
      duration: 8000,
    });
  }

  function confirmVoid() {
    toast("Void this restock?", {
      description: "Removes its cost from expenses, reports and cashflow, and takes out any of its stock not yet used. Stock already used stays used. This can't be undone.",
      action: { label: "Void", onClick: () => voidRestock() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function voidRestock() {
    if (!purchase) return;
    setRollingBack(true);
    try {
      for (const l of lines) {
        await execute(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = datetime('now') WHERE id = ?`,
          [l.quantity_remaining ?? 0, l.item_id],
        );
      }
      // Zeroing the batches takes them out of FIFO consumption and stock-on-hand lookups.
      await execute("UPDATE inventory_movements SET quantity_remaining = 0 WHERE purchase_id = ?", [purchase.id]);
      await execute("UPDATE expenses SET voided_at = datetime('now') WHERE purchase_id = ?", [purchase.id]);
      await execute("UPDATE inventory_purchases SET voided_at = datetime('now') WHERE id = ?", [purchase.id]);
      await execute("DELETE FROM cashflow_entries WHERE source = 'restock' AND source_id = ?", [purchase.id]);
      toast.success("Restock voided");
      navigate("/inventory/purchases");
    } catch (err) {
      toast.error(`Couldn't void: ${String(err instanceof Error ? err.message : err)}`);
      setRollingBack(false);
    }
  }

  async function rollback() {
    if (!purchase || !canRollback) return;
    setRollingBack(true);
    try {
      for (const l of lines) {
        await execute(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = datetime('now') WHERE id = ?`,
          [l.quantity, l.item_id],
        );
      }
      await execute("DELETE FROM inventory_movements WHERE purchase_id = ?", [purchase.id]);
      await execute("DELETE FROM inventory_purchases WHERE id = ?", [purchase.id]);
      await execute("DELETE FROM cashflow_entries WHERE source = 'restock' AND source_id = ?", [purchase.id]);
      toast.success("Restock rolled back");
      navigate("/inventory/purchases");
    } catch (err) {
      toast.error(`Couldn't roll back: ${String(err instanceof Error ? err.message : err)}`);
      setRollingBack(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{purchase.supplier || "Restock"}</h1>
          <p className="truncate text-xs text-ink/50">{purchase.purchase_date}</p>
        </div>
        {!purchase.voided_at && hasAccess("restock_edit") && (
          <Link
            to={`/inventory/purchases/${purchase.id}/edit`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Edit restock"
          >
            <Pencil size={16} strokeWidth={2.2} />
          </Link>
        )}
      </div>

      {(purchase.reference || purchase.notes) && (
        <div className="mb-4 space-y-1 rounded-2xl bg-surface p-3.5 shadow-sm">
          {purchase.reference && (
            <p className="text-sm text-ink/70">
              <span className="text-ink/40">Reference: </span>
              {purchase.reference}
            </p>
          )}
          {purchase.notes && (
            <p className="text-sm text-ink/70">
              <span className="text-ink/40">Notes: </span>
              {purchase.notes}
            </p>
          )}
        </div>
      )}

      {purchase.receipt_image && (
        <img src={purchase.receipt_image} alt="Receipt" className="mb-4 w-full rounded-2xl object-cover shadow-sm" />
      )}

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Items</p>

      {lines.length === 0 && otherLines.length === 0 && <EmptyState text="No items on this restock." />}
      {lines.length === 0 && otherLines.length > 0 && (
        <p className="px-1 text-xs text-ink/30">No inventory items — see other costs below.</p>
      )}

      <div className="space-y-1.5">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{l.item_name}</p>
              <p className="truncate text-xs text-ink/50">
                {l.quantity} {l.item_unit} × ₱{(l.unit_price ?? 0).toFixed(2)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-ink">
              ₱{(l.quantity * (l.unit_price ?? 0)).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {otherLines.length > 0 && (
        <>
          <p className="mt-4 mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Other costs</p>
          <div className="space-y-1.5">
            {otherLines.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{l.description}</p>
                  <p className="truncate text-xs text-ink/50">{l.category_name ?? "Uncategorized"}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink">₱{l.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <p className="text-xs font-medium text-white/70">Total amount</p>
        <p className="mt-0.5 text-2xl font-semibold">₱{total.toFixed(2)}</p>
      </div>

      {purchase.voided_at && (
        <p className="mt-4 text-center text-sm font-semibold text-red-600">Voided {purchase.voided_at.slice(0, 10)}</p>
      )}

      {!purchase.voided_at && hasAccess("restock_void") && (
        <button
          type="button"
          onClick={confirmVoid}
          disabled={rollingBack}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 shadow-sm disabled:opacity-50"
        >
          <Ban size={16} strokeWidth={2.2} />
          Void restock
        </button>
      )}

      {!purchase.voided_at && hasAccess("restock_rollback") && (
        <>
          <button
            type="button"
            onClick={confirmRollback}
            disabled={rollingBack || !canRollback}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 shadow-sm disabled:opacity-50"
          >
            <Undo2 size={16} strokeWidth={2.2} />
            {rollingBack ? "Rolling back…" : "Roll back restock"}
          </button>
          {!canRollback && (
            <p className="mt-2 text-center text-[11px] text-ink/30">
              Can't roll back — some of this stock has already been used.
            </p>
          )}
        </>
      )}
    </div>
  );
}
