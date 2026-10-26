import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, Camera, X, Check, Search } from "lucide-react";
import { execute, select } from "../lib/db";
import { fileToCompressedDataUrl } from "../lib/image";
import type { ExpenseCategory, InventoryItem, PaymentMethod } from "../types";

interface Line {
  packSize: string;
  packBonus: string;
  packCount: string;
  packPrice: string;
}

interface OtherLine {
  id: number;
  description: string;
  categoryId: string;
  amount: string;
}

interface ItemRow extends InventoryItem {
  last_price: number | null;
}

/** units/pack, bonus units/pack, packs bought, price/pack -> total qty received, cost, and
 * effective per-unit cost. With packSize=1/packBonus=0 this reduces to plain qty x price, so a
 * normal (non-bundle) purchase behaves exactly like typing quantity and unit price directly. */
function calcLine(line: Line) {
  const packSize = Number(line.packSize) || 0;
  const packBonus = Number(line.packBonus) || 0;
  const packCount = Number(line.packCount) || 0;
  const packPrice = Number(line.packPrice) || 0;
  const totalQty = packCount * (packSize + packBonus);
  const lineCost = packCount * packPrice;
  const unitCost = totalQty > 0 ? lineCost / totalQty : 0;
  return { totalQty, lineCost, unitCost };
}

export default function RestockForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const nextOtherLineId = useRef(1);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [otherLines, setOtherLines] = useState<OtherLine[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      select<ItemRow>(
        `SELECT i.*,
                (SELECT m.unit_price FROM inventory_movements m
                 WHERE m.item_id = i.id AND m.movement_type = 'restock' AND m.unit_price IS NOT NULL
                 ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_price
         FROM inventory_items i
         WHERE i.is_active = 1
         ORDER BY i.name`,
      ),
      select<ExpenseCategory>("SELECT * FROM expense_categories ORDER BY name"),
    ]).then(([rows, cats]) => {
      setItems(rows);
      setExpenseCategories(cats);
      const preselect = searchParams.get("item");
      const item = rows.find((it) => String(it.id) === preselect);
      if (item) {
        setLines({
          [item.id]: {
            packSize: "1",
            packBonus: "0",
            packCount: "",
            packPrice: item.last_price != null ? String(item.last_price) : "",
          },
        });
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

  const itemsTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + calcLine(lines[item.id]).lineCost, 0),
    [lines, selectedItems],
  );
  const otherTotal = useMemo(
    () => otherLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [otherLines],
  );
  const total = itemsTotal + otherTotal;

  function toggleItem(item: ItemRow) {
    setLines((prev) => {
      const next = { ...prev };
      if (item.id in next) {
        delete next[item.id];
      } else {
        next[item.id] = {
          packSize: "1",
          packBonus: "0",
          packCount: "",
          packPrice: item.last_price != null ? String(item.last_price) : "",
        };
      }
      return next;
    });
  }

  function updateLine(itemId: number, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function addOtherLine() {
    const id = nextOtherLineId.current++;
    setOtherLines((prev) => [...prev, { id, description: "", categoryId: "", amount: "" }]);
  }

  function updateOtherLine(id: number, patch: Partial<OtherLine>) {
    setOtherLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeOtherLine(id: number) {
    setOtherLines((prev) => prev.filter((l) => l.id !== id));
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
      .map((item) => ({ item, line: lines[item.id], calc: calcLine(lines[item.id]) }))
      .filter(({ calc }) => calc.totalQty > 0);

    // A line with only a description or only an amount filled in used to be silently dropped
    // here (neither half of the `&&` below on its own), so it never got inserted anywhere --
    // no error shown, no expense row, nothing in the restock detail view. Block submission
    // instead so an incomplete "other cost" line can't vanish without the user noticing.
    const incompleteOtherLine = otherLines.find((l) => {
      const hasDescription = l.description.trim().length > 0;
      const hasAmount = Number(l.amount) > 0;
      return hasDescription !== hasAmount;
    });
    if (incompleteOtherLine) {
      setError(
        incompleteOtherLine.description.trim()
          ? `Enter an amount for "${incompleteOtherLine.description.trim()}".`
          : "Enter a description for the other cost with an amount.",
      );
      return;
    }

    const validOtherLines = otherLines.filter((l) => l.description.trim() && Number(l.amount) > 0);

    if (validLines.length === 0 && validOtherLines.length === 0) {
      setError("Add at least one item or other cost with an amount.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const purchaseRes = await execute(
        `INSERT INTO inventory_purchases (branch_id, supplier, reference, notes, receipt_image)
         VALUES (?, ?, ?, ?, ?)`,
        [
          validLines[0]?.item.branch_id ?? 1,
          supplier.trim() || null,
          reference.trim() || null,
          notes.trim() || null,
          receiptImage,
        ],
      );
      const purchaseId = purchaseRes.lastInsertId;

      for (const { item, line, calc } of validLines) {
        await execute(
          `INSERT INTO inventory_movements
             (item_id, branch_id, movement_type, quantity, purchase_id, unit_price, quantity_remaining, pack_size, pack_bonus, pack_count)
           VALUES (?, ?, 'restock', ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.branch_id,
            calc.totalQty,
            purchaseId,
            calc.unitCost,
            calc.totalQty,
            Number(line.packSize) || 0,
            Number(line.packBonus) || 0,
            Number(line.packCount) || 0,
          ],
        );
        await execute(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE id = ?`,
          [calc.totalQty, item.id],
        );
      }

      for (const l of validOtherLines) {
        await execute(
          `INSERT INTO expenses (branch_id, category_id, description, amount, receipt_ref, notes, receipt_image, purchase_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            validLines[0]?.item.branch_id ?? 1,
            l.categoryId ? Number(l.categoryId) : null,
            l.description.trim(),
            Number(l.amount),
            reference.trim() || null,
            notes.trim() || null,
            receiptImage,
            purchaseId,
          ],
        );
      }

      await execute(
        `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, method)
         VALUES (1, 'expense', 'restock', ?, ?, ?, ?)`,
        [purchaseId, total, supplier.trim() ? `Restock — ${supplier.trim()}` : "Restock", paymentMethod],
      );

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
          <p className="truncate text-xs text-ink/50">One receipt — items, supplies, or maintenance, in one entry</p>
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
            <div className="space-y-1.5">
              {selectedItems.map((item) => {
                const line = lines[item.id];
                const calc = calcLine(line);
                return (
                  <div key={item.id} className="rounded-xl bg-surface p-2.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.name}</p>
                      <button
                        type="button"
                        onClick={() => toggleItem(item)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-500"
                        aria-label={`Remove ${item.name}`}
                      >
                        <X size={14} strokeWidth={2.4} />
                      </button>
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                      <PackField
                        label="Units/pack"
                        value={line.packSize}
                        onChange={(v) => updateLine(item.id, { packSize: v })}
                      />
                      <PackField
                        label="+Bonus"
                        value={line.packBonus}
                        onChange={(v) => updateLine(item.id, { packBonus: v })}
                      />
                      <PackField
                        label="# Packs"
                        value={line.packCount}
                        onChange={(v) => updateLine(item.id, { packCount: v })}
                      />
                      <PackField
                        label="₱/Pack"
                        value={line.packPrice}
                        onChange={(v) => updateLine(item.id, { packPrice: v })}
                      />
                    </div>
                    {calc.totalQty > 0 ? (
                      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-ink/5 pt-1.5">
                        <p className="text-[11px] text-ink/40">
                          = {calc.totalQty} {item.unit} · ₱{calc.unitCost.toFixed(2)}/{item.unit}
                        </p>
                        <p className="shrink-0 text-xs font-semibold text-ink">
                          Subtotal: ₱{calc.lineCost.toFixed(2)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-ink/40">
                        1 pack = {(Number(line.packSize) || 0) + (Number(line.packBonus) || 0)} {item.unit} (
                        {line.packSize || 0} + {line.packBonus || 0} bonus). Enter # packs and price/pack — plain
                        purchases just use 1 pack.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Other costs</p>
            <button type="button" onClick={addOtherLine} className="text-xs font-semibold text-brand-600">
              + Add line
            </button>
          </div>
          {otherLines.length === 0 ? (
            <p className="px-1 text-xs text-ink/30">
              Maintenance, repairs, or one-off supplies on this same receipt that aren't tracked as stock.
            </p>
          ) : (
            <div className="space-y-1.5">
              {otherLines.map((line) => (
                <div key={line.id} className="rounded-xl bg-surface p-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateOtherLine(line.id, { description: e.target.value })}
                      placeholder="Description, e.g. Aircon repair"
                      className="min-w-0 flex-1 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                    />
                    <button
                      type="button"
                      onClick={() => removeOtherLine(line.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-500"
                      aria-label="Remove line"
                    >
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <select
                      value={line.categoryId}
                      onChange={(e) => updateOtherLine(line.id, { categoryId: e.target.value })}
                      className="flex-1 rounded-lg bg-surface-muted px-2 py-1.5 text-xs font-medium text-ink outline-none"
                    >
                      <option value="">No category</option>
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.amount}
                      onChange={(e) => updateOtherLine(line.id, { amount: e.target.value })}
                      placeholder="0.00"
                      className="w-24 rounded-lg bg-surface-muted px-2 py-1.5 text-center text-sm font-medium text-ink outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {total > 0 && (
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
            <p className="text-xs font-medium text-white/70">Total amount</p>
            <p className="mt-0.5 text-2xl font-semibold">₱{total.toFixed(2)}</p>
          </div>
        )}

        <div className="flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
          {(["cash", "gcash"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={
                "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                (paymentMethod === m ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {m === "gcash" ? "E-wallet" : "Cash"}
            </button>
          ))}
        </div>

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

function PackField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-center text-[9px] font-semibold tracking-wide text-ink/35 uppercase">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg bg-surface-muted px-1 py-1.5 text-center text-sm font-medium text-ink outline-none"
      />
    </label>
  );
}
