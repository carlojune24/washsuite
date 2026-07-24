import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ChevronDown, Clock3, TrendingDown, TrendingUp, CalendarDays } from "lucide-react";
import type { DtrReportDay } from "../lib/dtrReport";
import { sumDtrTotals } from "../lib/dtrData";
import { formatTime, isLate } from "../pages/Attendance";

const STANDARD_SHIFT_HOURS = 8;
const INITIAL_VISIBLE = 7;

function formatHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function dateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function totalMeta(d: DtrReportDay) {
  if (d.status === "absent") return { label: "Absent", color: "text-ink/40", pill: null };
  if (d.status === "leave") return { label: "On Leave", color: "text-ink/40", pill: null };
  if (d.status === null && d.hours_worked == null) return { label: "No Record", color: "text-ink/30", pill: null };

  const label = formatHM(d.hours_worked ?? 0);
  if (d.overtime_hours > 0) {
    return { label, color: "text-emerald-600", pill: { text: `+${formatHM(d.overtime_hours)}`, className: "bg-emerald-100 text-emerald-700" } };
  }
  if (d.undertime_hours > 0) {
    return { label, color: "text-amber-600", pill: { text: `-${formatHM(d.undertime_hours)}`, className: "bg-amber-100 text-amber-700" } };
  }
  return { label, color: "text-ink", pill: { text: "0h 00m", className: "bg-gray-100 text-gray-500" } };
}

/** Stats grid + day-by-day list shared between the payroll-run-scoped DTR and the standalone
 * monthly Attendance DTR — the two views differ only in how `days` gets fetched (a payroll
 * period vs. a picked calendar month), not in how a day list is rendered. */
export default function DtrDayList({ workerId, days }: { workerId: number | string; days: DtrReportDay[] }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  useEffect(() => setVisibleCount(INITIAL_VISIBLE), [days]);

  const totals = useMemo(() => sumDtrTotals(days), [days]);
  const visibleDays = useMemo(() => [...days].reverse().slice(0, visibleCount), [days, visibleCount]);

  return (
    <>
      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Clock3 size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Total Hours</p>
            <p className="truncate text-base font-bold text-blue-600">{formatHM(totals.hours)}</p>
            <p className="truncate text-[9px] text-ink/40">Rendered</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <TrendingDown size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Undertime</p>
            <p className="truncate text-base font-bold text-amber-600">{formatHM(totals.undertime)}</p>
            <p className="truncate text-[9px] text-ink/40">Below {STANDARD_SHIFT_HOURS}h</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Overtime</p>
            <p className="truncate text-base font-bold text-emerald-600">{formatHM(totals.overtime)}</p>
            <p className="truncate text-[9px] text-ink/40">Above {STANDARD_SHIFT_HOURS}h</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <CalendarDays size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Total Days</p>
            <p className="truncate text-base font-bold text-ink">{days.length}</p>
            <p className="truncate text-[9px] text-ink/40">Days</p>
          </div>
        </div>
        <div className="mt-3 border-t border-ink/5 pt-2.5 text-center text-[11px] text-ink/40">
          Standard work hours: {STANDARD_SHIFT_HOURS}h 00m / day
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-ink/5 px-3.5 py-2 text-[10px] font-semibold tracking-wide text-ink/40 uppercase">
          <span className="w-[22%] shrink-0">Date</span>
          <span className="w-[19%] shrink-0">In</span>
          <span className="w-[19%] shrink-0">Out</span>
          <span className="flex-1 text-right">Total</span>
          <span className="w-3.5 shrink-0" />
        </div>

        {visibleDays.map((d) => {
          const meta = totalMeta(d);
          const late = d.time_in ? isLate({ status: d.status, time_in: d.time_in }) : false;
          const isToday = d.work_date === today();
          return (
            <Link
              key={d.work_date}
              to={`/attendance/${workerId}?date=${d.work_date}`}
              className="flex items-center gap-1.5 border-b border-ink/5 px-3.5 py-3 last:border-0"
            >
              <div className="w-[22%] min-w-0 shrink-0">
                <p className="truncate text-xs font-semibold text-ink">{dateLabel(d.work_date)}</p>
                {isToday && <p className="whitespace-nowrap text-[10px] font-semibold text-brand-500">Today</p>}
              </div>
              <div className="w-[19%] min-w-0 shrink-0">
                <p className="truncate text-xs text-ink/60">{d.time_in ? formatTime(d.time_in) : "—"}</p>
                {d.time_in && (
                  <span
                    className={
                      "mt-0.5 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold " +
                      (late ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    {late ? "Late" : "On time"}
                  </span>
                )}
              </div>
              <div className="w-[19%] min-w-0 shrink-0">
                <p className="truncate text-xs text-ink/60">{d.time_out ? formatTime(d.time_out) : "—"}</p>
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className={"whitespace-nowrap text-xs font-bold " + meta.color}>{meta.label}</p>
                {meta.pill && (
                  <span className={"mt-0.5 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold " + meta.pill.className}>
                    {meta.pill.text}
                  </span>
                )}
              </div>
              <ChevronRight size={14} strokeWidth={2.2} className="shrink-0 text-ink/20" />
            </Link>
          );
        })}
      </div>

      {visibleCount < days.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + INITIAL_VISIBLE)}
          className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-semibold text-brand-500"
        >
          View More
          <ChevronDown size={14} strokeWidth={2.2} />
        </button>
      )}
    </>
  );
}
