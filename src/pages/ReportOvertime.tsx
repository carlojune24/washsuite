import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Timer } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface OvertimeRow {
  worker_id: number;
  full_name: string;
  total_overtime: number;
  total_undertime: number;
  days: number;
}

export default function ReportOvertime() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<OvertimeRow[]>([]);
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
    select<OvertimeRow>(
      `SELECT a.worker_id, w.full_name, SUM(a.overtime_hours) AS total_overtime,
              SUM(a.undertime_hours) AS total_undertime, COUNT(*) AS days
       FROM attendance a
       JOIN workers w ON w.id = a.worker_id
       ${where}
       GROUP BY a.worker_id
       HAVING total_overtime > 0 OR total_undertime > 0
       ORDER BY total_overtime DESC`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Overtime</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {!loading && rows.length === 0 && <EmptyState text="No overtime or undertime recorded in this period." />}

      <ul className="space-y-2">
        {rows.map((r) => (
          <ListRow
            key={r.worker_id}
            to={`/attendance/${r.worker_id}`}
            icon={Timer}
            title={r.full_name}
            subtitle={`${r.days} day${r.days === 1 ? "" : "s"} · ${r.total_undertime.toFixed(1)}h undertime`}
            value={`${r.total_overtime.toFixed(1)}h OT`}
          />
        ))}
      </ul>
    </div>
  );
}
