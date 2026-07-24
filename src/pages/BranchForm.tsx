import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import type { Branch } from "../types";

export default function BranchForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tin, setTin] = useState("");
  const [birPermitNo, setBirPermitNo] = useState("");
  const [orSeriesStart, setOrSeriesStart] = useState("");
  const [orSeriesEnd, setOrSeriesEnd] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState("Due upon receipt");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => {
      if (b) {
        setName(b.name ?? "");
        setAddress(b.address ?? "");
        setPhone(b.phone ?? "");
        setEmail(b.email ?? "");
        setTin(b.tin ?? "");
        setBirPermitNo(b.bir_permit_no ?? "");
        setOrSeriesStart(b.or_series_start != null ? String(b.or_series_start) : "");
        setOrSeriesEnd(b.or_series_end != null ? String(b.or_series_end) : "");
        setVatRegistered(!!b.vat_registered);
        setInvoiceTerms(b.invoice_terms ?? "Due upon receipt");
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError("Business name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await execute(
        `UPDATE branches
         SET name = ?, address = ?, phone = ?, email = ?, tin = ?, bir_permit_no = ?,
             or_series_start = ?, or_series_end = ?, vat_registered = ?, invoice_terms = ?
         WHERE id = 1`,
        [
          name.trim(),
          address.trim() || null,
          phone.trim() || null,
          email.trim() || null,
          tin.trim() || null,
          birPermitNo.trim() || null,
          orSeriesStart ? Number(orSeriesStart) : null,
          orSeriesEnd ? Number(orSeriesEnd) : null,
          vatRegistered ? 1 : 0,
          invoiceTerms.trim() || null,
        ],
      );
      toast.success("Business info saved");
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
          <h1 className="text-xl font-semibold text-ink">Business Info</h1>
          <p className="truncate text-xs text-ink/50">Used on printed receipts and the sales invoice</p>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Business</p>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Business name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Contact no.</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Sales Invoice (BIR)</p>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">TIN</span>
          <input
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            placeholder="000-000-000-000"
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">BIR Permit No.</span>
          <input
            value={birPermitNo}
            onChange={(e) => setBirPermitNo(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">OR series start</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={orSeriesStart}
              onChange={(e) => setOrSeriesStart(e.target.value)}
              placeholder="1"
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">OR series end</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={orSeriesEnd}
              onChange={(e) => setOrSeriesEnd(e.target.value)}
              placeholder="50"
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
        </div>
        <p className="text-[11px] text-ink/40">
          The next invoice printed picks up wherever numbering last left off (starting at the series start the
          first time). Reprinting an existing order's invoice always shows the same number.
        </p>

        <label className="flex items-center justify-between rounded-xl bg-surface-muted px-3.5 py-2.5">
          <div>
            <span className="block text-sm font-medium text-ink">VAT-registered</span>
            <span className="block text-[11px] text-ink/40">
              {vatRegistered ? "Invoice shows a computed 12% VAT line." : "Invoice shows sales as VAT-exempt/Non-VAT."}
            </span>
          </div>
          <input
            type="checkbox"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Invoice terms</span>
          <input
            value={invoiceTerms}
            onChange={(e) => setInvoiceTerms(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
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
        {saving ? "Saving…" : "Save Business Info"}
      </button>
    </div>
  );
}
