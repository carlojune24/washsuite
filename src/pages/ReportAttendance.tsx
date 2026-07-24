import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, UserCheck } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

type AttendanceStatus = "present" | "absent" | "leave" | "half_day";

interface StatusCountRow {
  worker_id: number;
  full_name: string;
  status: AttendanceStatus;
  count: number;
}

interface WorkerSummary {
  worker_id: number;
  full_name: string;
  present: number;
  absent: number;
  leave: number;
  half_day: number;
  total: number;
  rate: number;
}

export default function ReportAttendance() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<StatusCountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (range) {
      conditions.push("a.work_date >= ?", "a.work_date <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<StatusCountRow>(
      `SELECT a.worker_id, w.full_name, a.status, COUNT(*) AS count
       FROM attendance a
       JOIN workers w ON w.id = a.worker_id
       ${where}
       GROUP BY a.worker_id, a.status`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const summaries = useMemo<WorkerSummary[]>(() => {
    const byWorker = new Map<number, WorkerSummary>();
    for (const r of rows) {
      const existing =
        byWorker.get(r.worker_id) ??
        { worker_id: r.worker_id, full_name: r.full_name, present: 0, absent: 0, leave: 0, half_day: 0, total: 0, rate: 0 };
      existing[r.status] += r.count;
      existing.total += r.count;
      byWorker.set(r.worker_id, existing);
    }
    for (const w of byWorker.values()) {
      w.rate = w.total > 0 ? (w.present / w.total) * 100 : 0;
    }
    return [...byWorker.values()].sort((a, b) => a.rate - b.rate);
  }, [rows]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Attendance performance</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <p className="mb-3 px-1 text-[11px] text-ink/40">
        Sorted lowest attendance rate first. Rate = present days ÷ all recorded days (absent, leave, and
        half-days all count against it).
      </p>

      {!loading && summaries.length === 0 && <EmptyState text="No attendance recorded in this period." />}

      <ul className="space-y-2">
        {summaries.map((w) => (
          <ListRow
            key={w.worker_id}
            to={`/attendance/${w.worker_id}`}
            icon={UserCheck}
            iconClassName={w.rate < 80 ? "bg-red-100 text-red-600" : undefined}
            title={w.full_name}
            subtitle={`${w.present} present · ${w.absent} absent · ${w.leave} leave · ${w.half_day} half-day`}
            value={`${w.rate.toFixed(0)}%`}
            valueClassName={w.rate < 80 ? "text-red-500" : undefined}
          />
        ))}
      </ul>
    </div>
  );
}
