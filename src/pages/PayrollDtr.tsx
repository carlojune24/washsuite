import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileDown } from "lucide-react";
import { toast } from "sonner";
import { select } from "../lib/db";
import { generateDtrReportPdf, type DtrReportDay } from "../lib/dtrReport";
import { fetchDtrDays, sumDtrTotals } from "../lib/dtrData";
import type { PayrollRun, Worker } from "../types";
import DtrDayList from "../components/DtrDayList";

function periodLabel(from: string, to: string) {
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

export default function PayrollDtr() {
  const { runId, workerId } = useParams();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [days, setDays] = useState<DtrReportDay[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);

  async function loadDays(from: string, to: string) {
    setDays(await fetchDtrDays(workerId!, from, to));
  }

  useEffect(() => {
    async function load() {
      const [[r], [w]] = await Promise.all([
        select<PayrollRun>("SELECT * FROM payroll_runs WHERE id = ?", [runId]),
        select<Worker>("SELECT * FROM workers WHERE id = ?", [workerId]),
      ]);
      setRun(r ?? null);
      setWorker(w ?? null);
      if (r) {
        setFromDate(r.period_start);
        setToDate(r.period_end);
        await loadDays(r.period_start, r.period_end);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, workerId]);

  function handleApply() {
    if (!fromDate || !toDate) {
      toast.error("Pick both a from and to date.");
      return;
    }
    if (fromDate > toDate) {
      toast.error("From date must be before the to date.");
      return;
    }
    loadDays(fromDate, toDate);
  }

  const totals = useMemo(() => sumDtrTotals(days), [days]);

  function handleExportPdf() {
    if (!worker) return;
    setExporting(true);
    try {
      generateDtrReportPdf({
        businessName: "WashSuite",
        workerName: worker.full_name,
        position: worker.position,
        periodLabel: periodLabel(fromDate, toDate),
        days,
        totalHours: totals.hours,
        totalOvertime: totals.overtime,
        totalUndertime: totals.undertime,
      });
      toast.success("DTR exported");
    } catch (err) {
      console.error("DTR PDF export failed:", err);
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setExporting(false);
    }
  }

  if (!run || !worker) return null;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={`/payroll/${run.id}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{worker.full_name}</h1>
          <p className="truncate text-xs text-ink/50">{worker.position ? worker.position : "Daily Time Record"}</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-brand-500/30 bg-surface px-3.5 text-xs font-semibold text-brand-500 shadow-sm disabled:opacity-60"
        >
          <FileDown size={15} strokeWidth={2.2} />
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block rounded-xl bg-surface-muted px-3 py-2">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-xl bg-surface-muted px-3 py-2">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleApply}
          className="w-full rounded-xl bg-brand-500 py-2 text-xs font-semibold text-white shadow-sm"
        >
          Apply
        </button>
      </div>

      <DtrDayList workerId={workerId!} days={days} />
    </div>
  );
}
