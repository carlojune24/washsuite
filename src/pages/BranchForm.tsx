import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import { fileToCompressedDataUrl } from "../lib/image";
import type { Branch } from "../types";

export default function BranchForm() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tin, setTin] = useState("");
  const [birPermitNo, setBirPermitNo] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState("Due upon receipt");
  const [gcashQrImage, setGcashQrImage] = useState<string | null>(null);
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
        setVatRegistered(!!b.vat_registered);
        setInvoiceTerms(b.invoice_terms ?? "Due upon receipt");
        setGcashQrImage(b.gcash_qr_image ?? null);
      }
      setLoading(false);
    });
  }, []);

  async function handleQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      // PNG, not the default JPEG -- lossy compression blurs the fine modules of a QR
      // code and can make it unscannable.
      setGcashQrImage(await fileToCompressedDataUrl(file, 800, 1, "image/png"));
    } catch {
      setError("Couldn't read that image, try another.");
    }
  }

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
             vat_registered = ?, invoice_terms = ?, gcash_qr_image = ?
         WHERE id = 1`,
        [
          name.trim(),
          address.trim() || null,
          phone.trim() || null,
          email.trim() || null,
          tin.trim() || null,
          birPermitNo.trim() || null,
          vatRegistered ? 1 : 0,
          invoiceTerms.trim() || null,
          gcashQrImage,
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

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">E-wallet</p>
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <span className="mb-2 block text-xs font-medium text-ink/50">
          QR code — shown at checkout so customers can scan to pay
        </span>
        {gcashQrImage ? (
          <div className="relative inline-block">
            <img src={gcashQrImage} alt="E-wallet QR code" className="h-32 w-32 rounded-xl object-contain bg-surface-muted" />
            <button
              type="button"
              onClick={() => setGcashQrImage(null)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white shadow-sm"
              aria-label="Remove QR code"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600"
            aria-label="Upload E-wallet QR code"
          >
            <QrCode size={20} strokeWidth={2} />
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/*" onChange={handleQrFile} className="hidden" />
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
        <Link
          to="/settings/or-series"
          className="flex items-center justify-between rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-brand-500"
        >
          Manage OR series &amp; liquidation
          <ChevronRight size={16} strokeWidth={2.2} />
        </Link>
        <p className="text-[11px] text-ink/40">
          Register a numbering series from your BIR-issued booklet, void spoiled numbers, and view which order each
          number went to.
        </p>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3.5 py-2.5">
          <div className="min-w-0">
            <span className="block text-sm font-medium text-ink">VAT-registered</span>
            <span className="block text-[11px] text-ink/40">
              {vatRegistered ? "Invoice shows a computed 12% VAT line." : "Invoice shows sales as VAT-exempt/Non-VAT."}
            </span>
          </div>
          <input
            type="checkbox"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        </label>
        <p className="text-[11px] text-ink/40">
          Check this only if you're BIR-registered as VAT (mandatory once annual gross sales/receipts pass
          ₱3,000,000, or if you registered voluntarily). Leave unchecked if you're Non-VAT/Percentage Tax.
          <br />
          <br />
          <span className="font-medium text-ink/50">VAT-registered:</span> invoices show price ÷ 1.12 as the VAT-exempt
          base plus a 12% VAT line, and the SC/PWD discount is applied to that VAT-exempt base (VAT stripped first,
          then the discount applied).
          <br />
          <span className="font-medium text-ink/50">Not VAT-registered:</span> invoices show the price as-is with no
          VAT line, and the SC/PWD discount is applied as a flat percentage of the price directly.
        </p>

        <Link
          to="/settings/sc-pwd-discount"
          className="flex items-center justify-between rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-brand-500"
        >
          Manage SC/PWD discount %
          <ChevronRight size={16} strokeWidth={2.2} />
        </Link>

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
