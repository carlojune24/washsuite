import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { execute, select } from "../lib/db";
import type { Promo } from "../types";

const BLANK = {
  name: "",
  code: "",
  discount_value: "0",
  min_spend: "0",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
};

export default function PromoForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<Promo>("SELECT * FROM promos WHERE id = ?", [id]).then(([p]) => {
      if (p) {
        setForm({
          name: p.name,
          code: p.code ?? "",
          discount_value: String(p.discount_value),
          min_spend: String(p.min_spend),
          starts_at: p.starts_at ? p.starts_at.slice(0, 10) : "",
          ends_at: p.ends_at ? p.ends_at.slice(0, 10) : "",
          usage_limit: p.usage_limit != null ? String(p.usage_limit) : "",
        });
        setDiscountType(p.discount_type);
        setIsActive(p.is_active === 1);
      }
      setLoading(false);
    });
  }, [id]);

  function update<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Open-ended bounds (null) are treated as -infinity/+infinity, so e.g. a promo with no end
  // date overlaps anything that starts before it does, regardless of the other promo's own end.
  function rangesOverlap(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null) {
    const aStartsBeforeBEnds = aStart === null || bEnd === null || aStart <= bEnd;
    const bStartsBeforeAEnds = bStart === null || aEnd === null || bStart <= aEnd;
    return aStartsBeforeBEnds && bStartsBeforeAEnds;
  }

  function formatPromoRange(p: Promo) {
    const start = p.starts_at ? p.starts_at.slice(0, 10) : "no start date";
    const end = p.ends_at ? p.ends_at.slice(0, 10) : "no end date";
    return `${start} – ${end}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startsAt = form.starts_at ? `${form.starts_at} 00:00:00` : null;
      const endsAt = form.ends_at ? `${form.ends_at} 23:59:59` : null;

      if (isActive) {
        const others = await select<Promo>("SELECT * FROM promos WHERE is_active = 1");
        const conflict = others.find(
          (p) => (!isEdit || p.id !== Number(id)) && rangesOverlap(startsAt, endsAt, p.starts_at, p.ends_at),
        );
        if (conflict) {
          setError(
            `Overlaps with the active promo "${conflict.name}" (${formatPromoRange(conflict)}). Adjust the dates or set this one to Inactive.`,
          );
          setSaving(false);
          return;
        }
      }

      const values = [
        form.name.trim(),
        form.code.trim() ? form.code.trim().toUpperCase() : null,
        discountType,
        Number(form.discount_value) || 0,
        Number(form.min_spend) || 0,
        startsAt,
        endsAt,
        form.usage_limit.trim() ? Number(form.usage_limit) : null,
        isActive ? 1 : 0,
      ];
      if (isEdit) {
        await execute(
          `UPDATE promos SET name = ?, code = ?, discount_type = ?, discount_value = ?, min_spend = ?,
           starts_at = ?, ends_at = ?, usage_limit = ?, is_active = ? WHERE id = ?`,
          [...values, id],
        );
      } else {
        await execute(
          `INSERT INTO promos (name, code, discount_type, discount_value, min_spend, starts_at, ends_at, usage_limit, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values,
        );
      }
      navigate("/promos");
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
          to="/promos"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit promo" : "Add promo"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Name *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Grand Opening"
            required
            autoFocus
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Code (optional)</span>
          <input
            type="text"
            value={form.code}
            onChange={(e) => update("code", e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME10"
            className="w-full text-sm font-medium tracking-wide text-ink outline-none placeholder:text-ink/30 placeholder:tracking-normal"
          />
        </label>

        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Status</span>
          <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
            {([true, false] as const).map((active) => (
              <button
                key={String(active)}
                type="button"
                onClick={() => setIsActive(active)}
                className={
                  "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors " +
                  (isActive === active ? "bg-brand-500 text-white" : "text-ink/50")
                }
              >
                {active ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Discount type</span>
          <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
            {(["percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDiscountType(t)}
                className={
                  "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors " +
                  (discountType === t ? "bg-brand-500 text-white" : "text-ink/50")
                }
              >
                {t === "percent" ? "% Percent" : "₱ Fixed amount"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">
              {discountType === "percent" ? "Discount %" : "Discount ₱"}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.discount_value}
              onChange={(e) => update("discount_value", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Min spend</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.min_spend}
              onChange={(e) => update("min_spend", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Starts</span>
            <input
              type="date"
              value={form.starts_at}
              onChange={(e) => update("starts_at", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Ends</span>
            <input
              type="date"
              value={form.ends_at}
              onChange={(e) => update("ends_at", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>
        <p className="px-1 text-[11px] text-ink/40">Leave either date blank for no start/end limit.</p>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Usage limit (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.usage_limit}
            onChange={(e) => update("usage_limit", e.target.value)}
            placeholder="Unlimited"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add promo"}
        </button>
      </form>
    </div>
  );
}
