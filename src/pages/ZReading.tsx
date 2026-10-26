import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileDown, Lock } from "lucide-react";
import { toast } from "sonner";
import { select, formatDateTime } from "../lib/db";
import { useAuth } from "../lib/auth";
import type { Branch, ZReading as ZReadingRow } from "../types";
import {
  getStoredTerminalId,
  setStoredTerminalId,
  getLastZReading,
  listZReadings,
  previewReading,
  generateZReading,
  type ReadingPreview,
} from "../lib/zreading";
import { getGrandTotal } from "../lib/grandTotal";
import { generateZReadingPdf } from "../lib/zreadingReport";

const BRANCH_ID = 1; // this app runs a single branch today, same assumption or_series.ts makes

function peso(n: number) {
  return `₱${n.toFixed(2)}`;
}

export default function ZReading() {
  const { currentUser } = useAuth();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [terminalId, setTerminalId] = useState(getStoredTerminalId());
  const [grandTotal, setGrandTotal] = useState(0);
  const [lastReading, setLastReading] = useState<ZReadingRow | null>(null);
  const [history, setHistory] = useState<ZReadingRow[]>([]);
  const [preview, setPreview] = useState<ReadingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const [[b], total, last, rows] = await Promise.all([
        select<Branch>("SELECT * FROM branches WHERE id = ?", [BRANCH_ID]),
        getGrandTotal(BRANCH_ID),
        getLastZReading(BRANCH_ID, terminalId),
        listZReadings(BRANCH_ID, terminalId),
      ]);
      setBranch(b ?? null);
      setGrandTotal(total);
      setLastReading(last);
      setHistory(rows);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!branch) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await previewReading(BRANCH_ID, terminalId, branch));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleClose() {
    if (!branch) return;
    setClosing(true);
    setError(null);
    try {
      const reading = await generateZReading(BRANCH_ID, terminalId, branch, currentUser?.id ?? null);
      toast.success(`Z-Reading #${reading.sequence_no} closed`);
      setConfirmClose(false);
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setClosing(false);
    }
  }

  function handleExportPdf(reading: ZReadingRow) {
    if (!branch) return;
    try {
      generateZReadingPdf({ businessName: branch.name, branch, reading });
      toast.success("Z-Reading exported");
    } catch (err) {
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Z-Reading / X-Reading</h1>
          <p className="truncate text-xs text-ink/50">Terminal {terminalId}</p>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <p className="text-xs font-medium text-white/70">Lifetime grand total (non-resettable)</p>
        <p className="mt-0.5 text-2xl font-semibold">{peso(grandTotal)}</p>
        <p className="mt-1 text-xs text-white/80">
          {lastReading
            ? `Last close: Z-Counter #${lastReading.sequence_no} · ${formatDateTime(lastReading.created_at)}`
            : "No Z-Reading closed yet"}
        </p>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <label className="mb-1 block text-xs font-medium text-ink/50">Terminal ID</label>
        <input
          value={terminalId}
          onChange={(e) => {
            const next = e.target.value || "MAIN";
            setTerminalId(next);
            setStoredTerminalId(next);
          }}
          placeholder="MAIN"
          className="w-full rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
        />
        <p className="mt-1 text-[11px] text-ink/40">
          Device-local — only change this if this branch runs more than one register.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewing}
          className="flex-1 rounded-2xl bg-surface py-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-60"
        >
          {previewing ? "Loading…" : "Preview X-Reading"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmClose(true)}
          className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm"
        >
          Close & Generate Z-Reading
        </button>
      </div>

      {preview && <ReadingSummary title="X-Reading preview (not saved)" data={preview} />}

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-[28px] bg-surface-muted p-4 shadow-xl sm:rounded-[28px]">
            <div className="mb-3 flex flex-col items-center text-center">
              <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Lock size={20} strokeWidth={2.4} />
              </span>
              <h2 className="text-lg font-semibold text-ink">Close this period?</h2>
              <p className="mt-1 text-xs text-ink/50">
                This writes an immutable Z-Reading record — it can never be edited or deleted afterward.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                disabled={closing}
                className="flex-1 rounded-2xl bg-surface py-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {closing ? "Closing…" : "Confirm close"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">History</p>
      {history.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink/40">No Z-Readings closed yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {history.map((r) => (
            <li key={r.id} className="rounded-2xl bg-surface p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Z-Counter #{r.sequence_no}</p>
                  <p className="text-xs text-ink/50">{formatDateTime(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{peso(r.gross_sales)}</span>
                  <button
                    type="button"
                    onClick={() => handleExportPdf(r)}
                    title="Export PDF"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-brand-500"
                  >
                    <FileDown size={14} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadingSummary({ title, data }: { title: string; data: ReadingPreview }) {
  const rows: [string, string][] = [
    ["Gross Sales", peso(data.grossSales)],
    ["Vatable Sales", peso(data.vatableSales)],
    ["VAT Amount (12%)", peso(data.vatAmount)],
    ["VAT-Exempt Sales", peso(data.vatExemptSales)],
    ["Zero-Rated Sales", peso(data.zeroRatedSales)],
    ["SC/PWD Discount", peso(data.scPwdDiscountTotal)],
    ["Other Discounts", peso(data.otherDiscountTotal)],
    ["Cash Sales", peso(data.cashSales)],
    ["Cashless Sales", peso(data.cashlessSales)],
    ["Transactions", String(data.transactionCount)],
  ];
  return (
    <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink/40 uppercase">{title}</p>
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-ink/50">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
