import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import type { Branch } from "../types";

export default function AuditViewSettings() {
  const [hidePrintReceipt, setHidePrintReceipt] = useState(false);
  const [hideUninvoicedSales, setHideUninvoicedSales] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => {
      if (b) {
        setHidePrintReceipt(!!b.hide_print_receipt);
        setHideUninvoicedSales(!!b.hide_uninvoiced_sales_in_cashflow);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await execute(
        `UPDATE branches
         SET hide_print_receipt = ?, hide_uninvoiced_sales_in_cashflow = ?
         WHERE id = 1`,
        [hidePrintReceipt ? 1 : 0, hideUninvoicedSales ? 1 : 0],
      );
      toast.success("Audit view settings saved");
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
          <h1 className="text-xl font-semibold text-ink">Others</h1>
        </div>
      </div>

      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3.5 py-2.5">
          <div className="min-w-0">
            <span className="block text-sm font-medium text-ink">Hide Print Receipt button</span>
            <span className="block text-[11px] text-ink/40">
              Hides the plain "Print Receipt" button in New Order and Order Detail. The official "Print Invoice"/
              "Download PDF" flow is unaffected.
            </span>
          </div>
          <input
            type="checkbox"
            checked={hidePrintReceipt}
            onChange={(e) => setHidePrintReceipt(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3.5 py-2.5">
          <div className="min-w-0">
            <span className="block text-sm font-medium text-ink">Hide un-invoiced sales in Cashflow</span>
            <span className="block text-[11px] text-ink/40">
              Hides sale entries (and their totals) for orders with no invoice number from the Cashflow screen and
              its PDF export. Expenses, restock, payroll, and other entries are never affected. Cash on hand still
              reflects the true total either way.
            </span>
          </div>
          <input
            type="checkbox"
            checked={hideUninvoicedSales}
            onChange={(e) => setHideUninvoicedSales(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        </label>
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
