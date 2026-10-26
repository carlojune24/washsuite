import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, BookOpen, Ban, FileDown } from "lucide-react";
import { toast } from "sonner";
import ListRow from "../components/ListRow";
import { formatDateTime } from "../lib/db";
import { formatInvoiceNumber } from "../lib/invoice";
import { getOrSeriesLiquidation, voidNextOrNumber, type LiquidationRow, type OrSeriesLiquidation } from "../lib/orSeries";
import { generateOrSeriesLiquidationPdf } from "../lib/orSeriesReport";
import { useAuth } from "../lib/auth";

export default function OrSeriesDetail() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const [data, setData] = useState<OrSeriesLiquidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getOrSeriesLiquidation(Number(id)));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVoidNext() {
    if (!data) return;
    setVoiding(true);
    try {
      await voidNextOrNumber(data.series.id, voidReason.trim() || null, currentUser?.id ?? null);
      toast.success(`Number ${formatInvoiceNumber(data.series.next_number)} marked voided`);
      setVoidReason("");
      setShowVoidForm(false);
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setVoiding(false);
    }
  }

  function handleExportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      generateOrSeriesLiquidationPdf({ businessName: "WashSuite", series: data.series, rows: data.rows, totals: data.totals });
      toast.success("Liquidation report exported");
    } catch (err) {
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }
  if (error || !data) {
    return <p className="py-10 text-center text-sm text-red-600">{error ?? "Series not found."}</p>;
  }

  const { series, rows, totals } = data;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings/or-series"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">
            {formatInvoiceNumber(series.series_start)}–{formatInvoiceNumber(series.series_end)}
          </h1>
          <p className="truncate text-xs text-ink/50">
            {series.status === "active" ? "Active" : "Closed"} · Registered {series.registered_at}
            {series.permit_no ? ` · Permit ${series.permit_no}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          title="Export PDF"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand-500 shadow-sm disabled:opacity-60"
        >
          <FileDown size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard label="Issued" value={totals.issued} className="text-emerald-600" />
        <StatCard label="Voided" value={totals.voided} className="text-red-600" />
        <StatCard label="Unused" value={totals.unused} className="text-ink/40" />
      </div>

      {series.status === "active" && (
        <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
          {!showVoidForm ? (
            <button
              type="button"
              onClick={() => setShowVoidForm(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-xs font-semibold text-red-600"
            >
              <Ban size={13} strokeWidth={2.2} />
              Mark number {formatInvoiceNumber(series.next_number)} as damaged/spoiled
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink/50">
                Reason for voiding number {formatInvoiceNumber(series.next_number)}
              </p>
              <input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. printer jam, misprint"
                className="w-full rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowVoidForm(false)}
                  className="flex-1 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-ink/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVoidNext}
                  disabled={voiding}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {voiding ? "Voiding…" : "Confirm void"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Numbers</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <LiquidationRowItem key={row.number} row={row} />
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 text-center shadow-sm">
      <p className={`text-lg font-semibold ${className}`}>{value}</p>
      <p className="text-[11px] text-ink/40">{label}</p>
    </div>
  );
}

function LiquidationRowItem({ row }: { row: LiquidationRow }) {
  const number = formatInvoiceNumber(row.number);

  if (row.status === "issued" && row.order) {
    return (
      <ListRow
        to={`/sales/${row.order.id}`}
        icon={BookOpen}
        iconClassName="bg-emerald-100 text-emerald-600"
        title={number}
        subtitle={`${row.order.order_number} · ${row.order.customer_name ?? "Walk-in"} · ${formatDateTime(row.order.drop_off_at)}`}
        value="Issued"
        valueClassName="text-emerald-600"
      />
    );
  }

  if (row.status === "voided") {
    return (
      <ListRow
        icon={Ban}
        iconClassName="bg-red-100 text-red-600"
        title={number}
        subtitle={row.voidReason ? `Voided · ${row.voidReason}` : "Voided"}
        value="Voided"
        valueClassName="text-red-600"
      />
    );
  }

  return (
    <ListRow
      icon={BookOpen}
      iconClassName="bg-ink/5 text-ink/30"
      title={number}
      titleClassName="text-ink/40"
      subtitle="Unused"
      value="—"
      valueClassName="text-ink/30"
    />
  );
}
