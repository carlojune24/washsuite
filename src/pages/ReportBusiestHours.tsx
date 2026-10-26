import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import { EmptyState } from "../components/ListRow";

interface HourRow {
  hour: string;
  count: number;
}

interface WeekdayRow {
  weekday: string;
  count: number;
}

const WEEKDAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hourLabel(h: number) {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-xs text-ink/50">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-ink">{count}</span>
    </div>
  );
}

export default function ReportBusiestHours() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [hours, setHours] = useState<HourRow[]>([]);
  const [weekdays, setWeekdays] = useState<WeekdayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = ["status != 'cancelled'"];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(drop_off_at,1,10) >= ?", "substr(drop_off_at,1,10) <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    Promise.all([
      select<HourRow>(
        `SELECT strftime('%H', drop_off_at, 'localtime') AS hour, COUNT(*) AS count
         FROM orders
         ${where}
         GROUP BY hour
         ORDER BY hour`,
        params,
      ),
      select<WeekdayRow>(
        `SELECT strftime('%w', drop_off_at, 'localtime') AS weekday, COUNT(*) AS count
         FROM orders
         ${where}
         GROUP BY weekday
         ORDER BY weekday`,
        params,
      ),
    ]).then(([h, w]) => {
      setHours(h);
      setWeekdays(w);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const maxHourCount = Math.max(0, ...hours.map((h) => h.count));
  const maxWeekdayCount = Math.max(0, ...weekdays.map((w) => w.count));
  const empty = hours.length === 0 && weekdays.length === 0;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Busiest hours & days</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {!loading && empty && <EmptyState text="No orders in this period." />}

      {!empty && (
        <>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">By hour of day</p>
          <div className="mb-6 space-y-1.5 rounded-2xl bg-surface p-3.5 shadow-sm">
            {hours.map((h) => (
              <Bar key={h.hour} label={hourLabel(Number(h.hour))} count={h.count} max={maxHourCount} />
            ))}
          </div>

          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">By day of week</p>
          <div className="space-y-1.5 rounded-2xl bg-surface p-3.5 shadow-sm">
            {weekdays.map((w) => (
              <Bar key={w.weekday} label={WEEKDAY_LABEL[Number(w.weekday)]} count={w.count} max={maxWeekdayCount} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
