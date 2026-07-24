import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import type { InventoryItem } from "../types";

/** Truncates a number-input string to at most `places` decimal digits, e.g. "30.1234" -> "30.12".
 * Applied on every change so it works for both typing and pasting, rather than only validating
 * (and confusingly blocking submission) after the fact. */
function clampDecimals(value: string, places: number): string {
  const match = value.match(/^(-?\d*)(\.(\d*))?/);
  if (!match) return value;
  const [, intPart, , decPart] = match;
  if (decPart === undefined || decPart.length <= places) return value;
  return `${intPart}.${decPart.slice(0, places)}`;
}

const BLANK = {
  name: "",
  description: "",
  unit: "",
  reorder_level: "0",
  markup_type: "percent" as "percent" | "fixed",
  markup_percent: "0",
  markup_amount: "0",
  dose_size: "",
  dose_label: "",
  dose_unit_label: "",
  dose_unit_factor: "1000",
};

export default function InventoryItemForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<InventoryItem>("SELECT * FROM inventory_items WHERE id = ?", [id]).then(([it]) => {
      if (it) {
        const hasSmallUnit = it.dose_unit_factor > 0;
        setForm({
          name: it.name,
          description: it.description ?? "",
          unit: it.unit,
          reorder_level: String(it.reorder_level),
          markup_type: it.markup_type,
          markup_percent: String(it.markup_percent),
          markup_amount: String(it.markup_amount),
          // Small-unit mode stores dose_size as a fraction of `unit`; re-expand it back to the
          // small-unit value (e.g. 0.03 -> "30") so editing shows what was actually typed in,
          // not the underlying fraction. Rounded to 2dp since the multiplication alone can land
          // on IEEE754 noise (0.00003 * 1000 = 0.030000000000000002) even when the stored value
          // itself is clean.
          dose_size:
            it.dose_size > 0
              ? String(
                  hasSmallUnit ? Math.round(it.dose_size * it.dose_unit_factor * 100) / 100 : it.dose_size,
                )
              : "",
          dose_label: it.dose_label ?? "",
          dose_unit_label: hasSmallUnit ? (it.dose_unit_label ?? "") : "",
          dose_unit_factor: hasSmallUnit ? String(it.dose_unit_factor) : "1000",
        });
      }
      setLoading(false);
    });
  }, [id]);

  function update<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Small-unit mode is only active once both the unit name and a usable factor are present —
  // otherwise the Dose size field falls back to meaning a raw fraction of `unit`, exactly as
  // before this feature existed.
  const doseUnitFactor = Number(form.dose_unit_factor) || 0;
  const hasSmallUnit = form.dose_unit_label.trim() !== "" && doseUnitFactor > 0;

  /**
   * Changing the small-unit name or factor can flip whether Dose size means "a small-unit value"
   * or "a raw fraction of `unit`" — without this, the number left sitting in the field gets
   * silently reinterpreted under the new meaning instead of converted, e.g. a leftover "0.03"
   * (meant as a fraction) becomes "0.03" read as ml, quietly shrinking the real dose by 1000x.
   * Rescale it the moment the mode actually changes so it keeps meaning the same real quantity.
   */
  function updateDoseUnit(nextLabel: string, nextFactorStr: string) {
    const nextFactor = Number(nextFactorStr) || 0;
    const willHaveSmallUnit = nextLabel.trim() !== "" && nextFactor > 0;
    if (willHaveSmallUnit === hasSmallUnit) {
      setForm((f) => ({ ...f, dose_unit_label: nextLabel, dose_unit_factor: nextFactorStr }));
      return;
    }
    const current = Number(form.dose_size) || 0;
    const oldFactor = doseUnitFactor || 1;
    const rescaled = willHaveSmallUnit ? current * nextFactor : current / oldFactor;
    setForm((f) => ({
      ...f,
      dose_unit_label: nextLabel,
      dose_unit_factor: nextFactorStr,
      dose_size: rescaled > 0 ? String(Math.round(rescaled * 100) / 100) : f.dose_size,
    }));
  }
  const doseInput = Number(form.dose_size) || 0;
  const computedDoseSize = hasSmallUnit ? Math.round((doseInput / doseUnitFactor) * 1e6) / 1e6 : doseInput;
  const computedDoseLabel = hasSmallUnit
    ? doseInput > 0
      ? `${form.dose_size}${form.dose_unit_label.trim()}`
      : null
    : form.dose_label.trim() || null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.unit.trim()) {
      setError("Unit of measure is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const values = [
        form.name.trim(),
        form.description.trim() || null,
        form.unit.trim(),
        Number(form.reorder_level) || 0,
        form.markup_type,
        Number(form.markup_percent) || 0,
        Number(form.markup_amount) || 0,
        computedDoseSize,
        computedDoseLabel,
        hasSmallUnit ? form.dose_unit_label.trim() : null,
        hasSmallUnit ? doseUnitFactor : 0,
      ];
      if (isEdit) {
        await execute(
          `UPDATE inventory_items
           SET name = ?, description = ?, unit = ?, reorder_level = ?, markup_type = ?, markup_percent = ?, markup_amount = ?,
               dose_size = ?, dose_label = ?, dose_unit_label = ?, dose_unit_factor = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [...values, id],
        );
        navigate(`/inventory/${id}`);
      } else {
        const res = await execute(
          `INSERT INTO inventory_items (name, description, unit, reorder_level, markup_type, markup_percent, markup_amount, dose_size, dose_label, dose_unit_label, dose_unit_factor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values,
        );
        navigate(`/inventory/restock?item=${res.lastInsertId}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${form.name || "this item"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE inventory_items SET is_active = 0 WHERE id = ?", [id]);
      navigate("/inventory");
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
          to={isEdit ? `/inventory/${id}` : "/inventory"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit item" : "Add item"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" value={form.name} onChange={(v) => update("name", v)} required autoFocus />
        <Field label="Description" value={form.description} onChange={(v) => update("description", v)} />
        <Field
          label="Unit of measure"
          value={form.unit}
          onChange={(v) => update("unit", v)}
          placeholder="e.g. pc, sack, gallon, box"
          required
        />
        <Field
          label="Reorder level"
          value={form.reorder_level}
          onChange={(v) => update("reorder_level", v)}
          type="number"
        />
        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Markup over cost</span>
          <div className="mb-2 flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
            {(["percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update("markup_type", t)}
                className={
                  "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                  (form.markup_type === t ? "bg-brand-500 text-white" : "text-ink/50")
                }
              >
                {t === "percent" ? "% of cost" : "₱ fixed amount"}
              </button>
            ))}
          </div>
          {form.markup_type === "percent" ? (
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={form.markup_percent}
              onChange={(e) => update("markup_percent", e.target.value)}
              placeholder="e.g. 40"
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          ) : (
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={form.markup_amount}
              onChange={(e) => update("markup_amount", e.target.value)}
              placeholder={`e.g. 20 (pesos added per ${form.unit.trim() || "unit"})`}
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          )}
          <p className="mt-1 text-xs text-ink/40">
            {form.markup_type === "percent"
              ? "Retail price = cost × (1 + this %)."
              : `Retail price = cost + this many pesos, per whole ${form.unit.trim() || "unit"}. No percent math needed.`}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">
            Dose size for order add-ons <span className="font-normal text-ink/30">(optional)</span>
          </span>

          <label className="mt-2 block">
            <span className="mb-1 block text-[11px] text-ink/40">Small unit (optional)</span>
            <input
              type="text"
              value={form.dose_unit_label}
              onChange={(e) => updateDoseUnit(e.target.value, form.dose_unit_factor)}
              placeholder="e.g. ml, g"
              className="w-full rounded-xl bg-surface-muted px-2.5 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>

          {form.dose_unit_label.trim() !== "" ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-xs text-ink/50">1 {form.unit.trim() || "unit"} =</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.dose_unit_factor}
                  onChange={(e) => updateDoseUnit(form.dose_unit_label, e.target.value)}
                  className="w-20 rounded-xl bg-surface-muted px-2.5 py-1.5 text-center text-sm font-medium text-ink outline-none"
                />
                <span className="text-xs text-ink/50">{form.dose_unit_label.trim()}</span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-xs text-ink/50">Dose size</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.dose_size}
                  onChange={(e) => update("dose_size", clampDecimals(e.target.value, 2))}
                  placeholder="e.g. 30"
                  className="w-20 rounded-xl bg-surface-muted px-2.5 py-1.5 text-center text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                />
                <span className="text-xs text-ink/50">{form.dose_unit_label.trim()}</span>
              </div>

              <p className="mt-1.5 text-xs text-ink/40">
                {computedDoseLabel
                  ? `= ${computedDoseSize} ${form.unit.trim() || "unit"} · shown to staff as "${computedDoseLabel}". `
                  : ""}
                The +/- buttons on the order screen step by this amount instead of a whole {form.unit.trim() || "unit"}.
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.dose_size}
                  onChange={(e) => update("dose_size", clampDecimals(e.target.value, 2))}
                  placeholder={`e.g. 0.03 (${form.unit.trim() || "unit"})`}
                  className="w-1/2 rounded-xl bg-surface-muted px-2.5 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                />
                <input
                  type="text"
                  value={form.dose_label}
                  onChange={(e) => update("dose_label", e.target.value)}
                  placeholder="e.g. 30ml"
                  className="w-1/2 rounded-xl bg-surface-muted px-2.5 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
                />
              </div>
              <p className="mt-1.5 text-xs text-ink/40">
                When staff add this item straight to an order, the +/- buttons step by this amount (in{" "}
                {form.unit.trim() || "the item's unit"}) instead of a whole {form.unit.trim() || "unit"}, and show the
                label instead of the raw number. Name a small unit above (e.g. "ml") to type doses like "30" instead
                of doing this fraction yourself.
              </p>
            </>
          )}
        </div>
        <p className="px-1 text-xs text-ink/40">
          There's no cost or quantity field here — every peso of cost and every unit of stock comes from a Restock
          (FIFO batches). Retail price is always computed as the oldest unconsumed batch's cost × this markup.
          {!isEdit && " You'll be sent to Restock right after saving to bring in the first batch."}
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add item"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove item"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
      <span className="mb-1 block text-xs font-medium text-ink/50">
        {label}
        {required && " *"}
      </span>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
      />
    </label>
  );
}
