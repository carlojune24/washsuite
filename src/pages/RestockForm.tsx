import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, Camera, X, Check, Search } from "lucide-react";
import { execute, select } from "../lib/db";
import { fileToCompressedDataUrl } from "../lib/image";
import type { InventoryItem } from "../types";

interface Line {
  quantity: string;
  price: string;
}

interface ItemRow extends InventoryItem {
  last_price: number | null;
}

export default function RestockForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<ItemRow>(
      `SELECT i.*,
              (SELECT m.unit_price FROM inventory_movements m
               WHERE m.item_id = i.id AND m.movement_type = 'restock' AND m.unit_price IS NOT NULL
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_price
       FROM inventory_items i
       WHERE i.is_active = 1
       ORDER BY i.name`,
    ).then((rows) => {
      setItems(rows);
      const preselect = searchParams.get("item");
      const item = rows.find((it) => String(it.id) === preselect);
      if (item) {
        setLines({ [item.id]: { quantity: "", price: item.last_price != null ? String(item.last_price) : "" } });
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  const selectedItems = useMemo(() => items.filter((it) => it.id in lines), [items, lines]);

  const total = useMemo(
    () =>
      Object.values(lines).reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0),
    [lines],
  );

  function toggleItem(item: ItemRow) {
    setLines((prev) => {
      const next = { ...prev };
      if (item.id in next) {
        delete next[item.id];
      } else {
        next[item.id] = { quantity: "", price: item.last_price != null ? String(item.last_price) : "" };
      }
      return next;
    });
  }

  function updateLine(itemId: number, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setReceiptImage(await fileToCompressedDataUrl(file));
    } catch {
      setError("Couldn't read that image, try another.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validLines = selectedItems
      .map((item) => ({ item, line: lines[item.id] }))
      .filter(({ line }) => Number(line.quantity) > 0);

    if (validLines.length === 0) {
      setError("Select at least one item and enter a quantity.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const purchaseRes = await execute(
        `INSERT INTO inventory_purchases (branch_id, supplier, reference, notes, receipt_image)
         VALUES (?, ?, ?, ?, ?)`,
        [
          validLines[0].item.branch_id,
          supplier.trim() || null,
          reference.trim() || null,
          notes.trim() || null,
          receiptImage,
        ],
      );
      const purchaseId = purchaseRes.lastInsertId;

      for (const { item, line } of validLines) {
        const qty = Number(line.quantity);
        const price = Number(line.price) || 0;
        await execute(
          `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, purchase_id, unit_price, quantity_remaining)
           VALUES (?, ?, 'restock', ?, ?, ?, ?)`,
          [item.id, item.branch_id, qty, purchaseId, price, qty],
        );
        await execute(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE id = ?`,
          [qty, item.id],
        );
      }

      navigate("/inventory");
    } catch (err) {
      setError(String(err));
    } finally {
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
          to="/inventory"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Restock</h1>
          <p className="truncate text-xs text-ink/50">One receipt, one or more items</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Select items</p>

          <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <Search size={16} strokeWidth={2.2} className="text-ink/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
            />
          </label>

          {filteredItems.length === 0 && <p className="py-4 text-center text-xs text-ink/40">No items found.</p>}

          <div className="flex flex-wrap gap-1.5">
            {filteredItems.map((it) => {
              const checked = it.id in lines;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggleItem(it)}
                  className={
                    "flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                    (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
                  }
                >
                  <span
                    className={
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border " +
                      (checked ? "border-white/70 bg-white/20" : "border-ink/15")
                    }
                  >
                    {checked && <Check size={9} strokeWidth={3.5} />}
                  </span>
                  {it.name}
                </button>
              );
            })}
          </div>
        </div>

        {selectedItems.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
              Quantity &amp; price
            </p>
            <div className="flex items-center gap-2 px-3 text-[10px] font-semibold tracking-wide text-ink/35 uppercase">
              <span className="flex-1">Item</span>
              <span className="w-14 text-center">Qty</span>
              <span className="w-16 text-center">Price</span>
              <span className="w-6" />
            </div>
            <div className="mt-1 space-y-1.5">
              {selectedItems.map((item) => {
                const line = lines[item.id];
                return (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface py-1.5 pl-3 pr-2 shadow-sm">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.name}</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(item.id, { quantity: e.target.value })}
                      placeholder="0"
                      className="w-14 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.price}
                      onChange={(e) => updateLine(item.id, { price: e.target.value })}
                      placeholder="0"
                      className="w-16 rounded-lg bg-surface-muted px-1.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-500"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
            <p className="text-xs font-medium text-white/70">Total amount</p>
            <p className="mt-0.5 text-2xl font-semibold">₱{total.toFixed(2)}</p>
          </div>
        )}

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

        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Receipt photo</span>
          {receiptImage ? (
            <div className="relative inline-block">
              <img src={receiptImage} alt="Receipt" className="h-28 w-28 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setReceiptImage(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white shadow-sm"
                aria-label="Remove photo"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600"
              aria-label="Add receipt photo"
            >
              <Camera size={20} strokeWidth={2} />
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Confirm restock"}
        </button>
      </form>
    </div>
  );
}
