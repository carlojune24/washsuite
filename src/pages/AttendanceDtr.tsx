import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, FileDown } from "lucide-react";
import { toast } from "sonner";
import { select } from "../lib/db";
import { generateDtrReportPdf, type DtrReportDay } from "../lib/dtrReport";
import { fetchDtrDays, sumDtrTotals } from "../lib/dtrData";
import type { Worker } from "../types";
import DtrDayList from "../components/DtrDayList";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

export default function AttendanceDtr() {
  const { workerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") || currentMonth();

  const [worker, setWorker] = useState<Worker | null>(null);
  const [days, setDays] = useState<DtrReportDay[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      const [[w], d] = await Promise.all([
        select<Worker>("SELECT * FROM workers WHERE id = ?", [workerId]),
        fetchDtrDays(workerId!, monthRange(month).from, monthRange(month).to),
      ]);
      setWorker(w ?? null);
      setDays(d);
    }
    load();
  }, [workerId, month]);

  function handleMonthChange(next: string) {
    setSearchParams(next === currentMonth() ? {} : { month: next });
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
        periodLabel: monthLabel(month),
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

  if (!worker) return null;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/attendance"
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

      <label className="mb-4 block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Month</span>
        <input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="w-full text-sm font-medium text-ink outline-none"
        />
      </label>

      <DtrDayList workerId={workerId!} days={days} />
    </div>
  );
}
