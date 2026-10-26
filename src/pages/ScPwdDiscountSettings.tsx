import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import type { Branch } from "../types";

export default function ScPwdDiscountSettings() {
  const [scPwdDiscountPercent, setScPwdDiscountPercent] = useState("20");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => {
      if (b) setScPwdDiscountPercent(String(b.sc_pwd_discount_percent ?? 20));
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    const scPwdPercent = Number(scPwdDiscountPercent);
    if (!(scPwdPercent > 0 && scPwdPercent <= 100)) {
      setError("SC/PWD discount % must be a number between 0 and 100.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await execute("UPDATE branches SET sc_pwd_discount_percent = ? WHERE id = 1", [scPwdPercent]);
      toast.success("SC/PWD discount saved");
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
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">SC/PWD Discount</h1>
          <p className="truncate text-xs text-ink/50">Statutory discount rate applied to senior citizen & PWD sales</p>
        </div>
      </div>

      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">SC/PWD discount %</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={scPwdDiscountPercent}
            onChange={(e) => setScPwdDiscountPercent(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
          <span className="mt-1 block text-[11px] text-ink/40">
            Statutory rate is 20% under RA 9994 (seniors) and RA 10754 (PWD). Only change this if that rate is ever
            amended.
          </span>
        </label>
        <p className="text-[11px] text-ink/40">
          For a VAT-registered business (set in Business Info), this discount applies to the price after VAT is
          stripped out. For a non-VAT business, it applies directly to the price.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
