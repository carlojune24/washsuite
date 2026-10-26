import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft, Radar } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface DayRow {
  day: string;
  declared: number;
  detected: number;
}

interface Coverage {
  total: number;
  bound: number;
  calibrated: number;
}

function formatDay(day: string): string {
  // day is a plain "YYYY-MM-DD" business-day string, not a stored UTC timestamp -- parse as
  // local so it doesn't shift a day depending on the viewer's timezone offset.
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ReportLoadVerification() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<DayRow[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);

    setLoading(true);
    Promise.all([
      range
        ? select<{ day: string; declared: number }>(
            `SELECT substr(drop_off_at,1,10) AS day, SUM(loads) AS declared
             FROM orders
             WHERE status != 'cancelled' AND substr(drop_off_at,1,10) >= ? AND substr(drop_off_at,1,10) <= ?
             GROUP BY day`,
            [range.from, range.to],
          )
        : Promise.resolve([]),
      range
        ? select<{ day: string; detected: number }>(
            `SELECT cycle_date AS day, COUNT(*) AS detected
             FROM machine_cycle_logs
             WHERE cycle_date >= ? AND cycle_date <= ?
             GROUP BY day`,
            [range.from, range.to],
          )
        : Promise.resolve([]),
      select<Coverage>(
        `SELECT
           (SELECT COUNT(*) FROM machines) AS total,
           (SELECT COUNT(*) FROM machine_sensors) AS bound,
           (SELECT COUNT(*) FROM machine_sensors WHERE idle_baseline IS NOT NULL AND running_baseline IS NOT NULL) AS calibrated`,
      ),
    ]).then(([declaredRows, detectedRows, coverageRows]) => {
      const byDay = new Map<string, DayRow>();
      for (const r of declaredRows) byDay.set(r.day, { day: r.day, declared: r.declared ?? 0, detected: 0 });
      for (const r of detectedRows) {
        const existing = byDay.get(r.day);
        if (existing) existing.detected = r.detected;
        else byDay.set(r.day, { day: r.day, declared: 0, detected: r.detected });
      }
      setRows([...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)));
      setCoverage(coverageRows[0] ?? null);
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
        <h1 className="text-xl font-semibold text-ink">Declared vs. sensor-detected loads</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <Radar size={15} strokeWidth={2.2} />
        </span>
        <p className="text-sm font-semibold">
          {coverage
            ? `${coverage.bound} of ${coverage.total} machine${coverage.total === 1 ? "" : "s"} have a sensor bound (${coverage.calibrated} calibrated)`
            : "Loading sensor coverage…"}
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          Only machines with a sensor bound contribute to the sensor-detected count below —
          uncovered machines mean staff-declared totals will naturally run higher.
        </p>
      </div>

      {!loading && rows.length === 0 && <EmptyState text="No orders or completed cycles in this period." />}

      <ul className="space-y-2">
        {rows.map((r) => {
          const diff = r.declared - r.detected;
          const mismatch = diff !== 0;
          return (
            <ListRow
              key={r.day}
              icon={mismatch ? AlertTriangle : CheckCircle2}
              iconClassName={mismatch ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}
              title={formatDay(r.day)}
              subtitle={`Declared: ${r.declared} · Sensor-detected: ${r.detected}`}
              value={mismatch ? (diff > 0 ? `+${diff}` : String(diff)) : "✓"}
              valueClassName={mismatch ? "text-amber-600" : "text-emerald-600"}
            />
          );
        })}
      </ul>
    </div>
  );
}
