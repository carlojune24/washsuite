import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, Clock, Droplets, History, Package, PartyPopper, Timer, WashingMachine, Wind } from "lucide-react";
import { select, formatDateTime } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import { EmptyState } from "../components/ListRow";
import SensorReadingChart from "../components/SensorReadingChart";
import {
  useMachineStatus,
  isMachineOnline,
  type MachineRuntimeStatus,
  type ReadingPoint,
} from "../lib/machineStatus";
import type { MachineSensor } from "../types";

const PERIOD_LOAD_LABEL: Record<Period, string> = {
  today: "loads today",
  week: "loads this week",
  month: "loads this month",
  custom: "loads this period",
};

// Keeps "online" staleness and "running for X min" ticking over live without needing a new
// sensor reading to arrive -- those are derived from timestamps, not events.
const TICK_MS = 15000;

function formatClock(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatElapsed(sinceMs: number) {
  const minutes = Math.max(0, Math.round((Date.now() - sinceMs) / 60000));
  if (minutes < 1) return "just started";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Same UTC-string convention as every other timestamp this app stores -- SQLite's datetime('now')
// (and the machineStatus.tsx dbString() helper) have no timezone marker, so a trailing "Z" is
// added before parsing to make sure it's read back as the UTC instant it actually is.
function parseUtcMs(dt: string): number {
  return new Date(dt.replace(" ", "T") + "Z").getTime();
}

function formatLoadDuration(startedAt: string, completedAt: string): string {
  const minutes = Math.max(0, Math.round((parseUtcMs(completedAt) - parseUtcMs(startedAt)) / 60000));
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

interface LoadLogRow {
  id: number;
  machine_id: number;
  started_at: string | null;
  completed_at: string;
}

export default function MachineStatus() {
  const { available, machines, statuses, sensorByMachine, readingHistory } = useMachineStatus();
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [periodLoads, setPeriodLoads] = useState<Record<number, number>>({});
  const [loadLogsByMachine, setLoadLogsByMachine] = useState<Record<number, LoadLogRow[]>>({});
  const [expandedMachineId, setExpandedMachineId] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // "today" always reads straight from the live context (statuses[...].loadsToday) instead of
  // re-querying, since that count already updates in real time as loads complete -- only
  // week/month/custom need a DB query, and those are inherently a look at the past rather than
  // something that needs to tick up live while the page sits open.
  useEffect(() => {
    if (period === "today") return;
    const range = periodRange(period, customFrom, customTo);
    if (!range) {
      setPeriodLoads({});
      return;
    }
    select<{ machine_id: number; c: number }>(
      "SELECT machine_id, COUNT(*) as c FROM machine_cycle_logs WHERE cycle_date >= ? AND cycle_date <= ? GROUP BY machine_id",
      [range.from, range.to],
    ).then((rows) => {
      const map: Record<number, number> = {};
      for (const r of rows) map[r.machine_id] = r.c;
      setPeriodLoads(map);
    });
  }, [period, customFrom, customTo]);

  // Sum of every machine's live loadsToday -- only changes at the moment a real load actually
  // completes (loadsToday is a plain increment, not touched by every reading), unlike `statuses`
  // itself which changes on every ~1/sec reading. Used below purely as a refetch trigger.
  const totalLoadsToday = useMemo(
    () => Object.values(statuses).reduce((sum, s) => sum + s.loadsToday, 0),
    [statuses],
  );

  // Individual load records (start/end, not just a count) for the "view load history" expander
  // below each card -- fetched for every period including "today", since there's no live-context
  // equivalent of the count shortcut above for per-load detail. Also reruns whenever
  // totalLoadsToday ticks up, so a load completing while this page is open shows up immediately
  // instead of only after the period filter is touched.
  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) {
      setLoadLogsByMachine({});
      return;
    }
    select<LoadLogRow>(
      `SELECT id, machine_id, started_at, completed_at FROM machine_cycle_logs
       WHERE cycle_date >= ? AND cycle_date <= ?
       ORDER BY completed_at DESC`,
      [range.from, range.to],
    ).then((rows) => {
      const map: Record<number, LoadLogRow[]> = {};
      for (const r of rows) (map[r.machine_id] ??= []).push(r);
      setLoadLogsByMachine(map);
    });
  }, [period, customFrom, customTo, totalLoadsToday]);

  function loadsFor(machineId: number): number {
    if (period === "today") return statuses[machineId]?.loadsToday ?? 0;
    return periodLoads[machineId] ?? 0;
  }

  // Live category is only meaningful for "today" -- showing "Running"/"Offline" while browsing
  // a past week/month would misleadingly imply that's still the machine's current state.
  const isLive = period === "today";

  const summary = useMemo(() => {
    if (!isLive) return null;
    let onlineCount = 0;
    let runningCount = 0;
    for (const m of machines) {
      const s = statuses[m.id];
      if (!isMachineOnline(s)) continue;
      onlineCount++;
      if (s?.status === "running") runningCount++;
    }
    return {
      total: machines.length,
      available: onlineCount - runningCount,
      running: runningCount,
      offline: machines.length - onlineCount,
    };
  }, [isLive, machines, statuses]);

  // Washer vs. dryer load totals for the selected period -- unlike `summary` above, meaningful
  // for every period (not just "today"), since "loads this week/month" by machine type is exactly
  // what this is for.
  const typeSummary = useMemo(() => {
    const result: Record<"washer" | "dryer", { loads: number; count: number }> = {
      washer: { loads: 0, count: 0 },
      dryer: { loads: 0, count: 0 },
    };
    for (const m of machines) {
      const loads = period === "today" ? (statuses[m.id]?.loadsToday ?? 0) : (periodLoads[m.id] ?? 0);
      result[m.type].loads += loads;
      result[m.type].count += 1;
    }
    return result;
  }, [machines, period, statuses, periodLoads]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Machine Status</h1>
          <p className="text-xs text-ink/40">Real-time overview of your machines</p>
        </div>
      </div>

      {!available && (
        <div className="rounded-2xl bg-surface p-3.5 text-sm text-ink/60 shadow-sm">
          Machine status isn't available on this device — it needs the desktop app, which is
          where ESP32 sensors report in.
        </div>
      )}

      {available && (
        <PeriodFilter
          period={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      )}

      {available && summary && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface p-3.5 shadow-sm">
          <SummaryStat value={summary.total} label="Total Machines" />
          <SummaryStat value={summary.available} label="Available" dotClassName="bg-emerald-500" valueClassName="text-emerald-600" />
          <SummaryStat value={summary.running} label="Running" dotClassName="bg-blue-500" valueClassName="text-blue-600" />
          <SummaryStat value={summary.offline} label="Offline" dotClassName="bg-red-500" valueClassName="text-red-600" />
        </div>
      )}

      {available && machines.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-surface p-3 shadow-sm">
            <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Droplets size={13} strokeWidth={2.2} />
            </span>
            <p className="text-xs font-semibold text-ink">Washers</p>
            <p className="text-lg font-bold text-ink">{typeSummary.washer.loads}</p>
            <p className="text-[10px] text-ink/40">
              {PERIOD_LOAD_LABEL[period]} · {typeSummary.washer.count} machine{typeSummary.washer.count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-sm">
            <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Wind size={13} strokeWidth={2.2} />
            </span>
            <p className="text-xs font-semibold text-ink">Dryers</p>
            <p className="text-lg font-bold text-ink">{typeSummary.dryer.loads}</p>
            <p className="text-[10px] text-ink/40">
              {PERIOD_LOAD_LABEL[period]} · {typeSummary.dryer.count} machine{typeSummary.dryer.count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}

      {available && machines.length === 0 && (
        <EmptyState text="No machines yet — add one under Settings > Machines & Sensors." />
      )}

      {available && machines.length > 0 && (
        <ul className="space-y-2">
          {machines.map((m) => (
            <MachineCard
              key={m.id}
              name={m.name}
              type={m.type}
              status={statuses[m.id]}
              isLive={isLive}
              loads={loadsFor(m.id)}
              periodLabel={PERIOD_LOAD_LABEL[period]}
              sensor={sensorByMachine[m.id]}
              history={readingHistory[m.id] ?? []}
              logs={loadLogsByMachine[m.id] ?? []}
              expanded={expandedMachineId === m.id}
              onToggleExpand={() => setExpandedMachineId((prev) => (prev === m.id ? null : m.id))}
            />
          ))}
        </ul>
      )}

      {available && isLive && summary && summary.offline === 0 && machines.length > 0 && (
        <div className="mt-4 rounded-2xl bg-surface p-6 text-center shadow-sm">
          <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-200/40 text-brand-600">
            <PartyPopper size={20} strokeWidth={2} />
          </span>
          <p className="text-sm font-semibold text-ink">All machines are working great!</p>
          <p className="mt-0.5 text-xs text-ink/40">Keep it up and check back anytime.</p>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  value,
  label,
  dotClassName,
  valueClassName,
}: {
  value: number;
  label: string;
  dotClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 border-l border-ink/5 px-2 first:border-l-0">
      <div className="flex items-center gap-1">
        {dotClassName && <span className={"h-1.5 w-1.5 rounded-full " + dotClassName} />}
        <span className={"text-lg font-bold " + (valueClassName ?? "text-ink")}>{value}</span>
      </div>
      <span className="text-[10px] text-ink/40">{label}</span>
    </div>
  );
}

function MachineCard({
  name,
  type,
  status,
  isLive,
  loads,
  periodLabel,
  sensor,
  history,
  logs,
  expanded,
  onToggleExpand,
}: {
  name: string;
  type: string;
  status: MachineRuntimeStatus | undefined;
  isLive: boolean;
  loads: number;
  periodLabel: string;
  sensor: MachineSensor | undefined;
  history: ReadingPoint[];
  logs: LoadLogRow[];
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const online = isLive && isMachineOnline(status);
  const running = online && status?.status === "running";
  const offline = isLive && !online;

  const avatarClassName = running
    ? "bg-blue-100 text-blue-600"
    : offline
      ? "bg-red-50 text-red-400"
      : online
        ? "bg-emerald-100 text-emerald-600"
        : "bg-surface-muted text-ink/40";

  const badge = !isLive
    ? null
    : running
      ? { label: "IN PROGRESS", className: "bg-blue-100 text-blue-700" }
      : offline
        ? { label: "OFFLINE", className: "bg-red-100 text-red-600" }
        : { label: "AVAILABLE", className: "bg-emerald-100 text-emerald-700" };

  const dotLabel = running ? "Running" : offline ? "Offline" : "Idle";
  const dotClassName = running ? "bg-blue-500" : offline ? "bg-red-500" : "bg-emerald-500";

  return (
    <li className="rounded-2xl bg-surface p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl " + avatarClassName}>
          <WashingMachine size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink/40 capitalize">{type}</p>
          {isLive && (
            <span className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-ink/60">
              <span className={"h-1.5 w-1.5 rounded-full " + dotClassName} />
              {dotLabel}
            </span>
          )}
        </div>
        {badge && (
          <span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide " + badge.className}>
            {badge.label}
          </span>
        )}
      </div>

      {running && status?.runningSince && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-ink/5 pt-3 text-xs text-blue-600">
          <Timer size={13} strokeWidth={2.2} />
          <span className="font-semibold">Running for {formatElapsed(status.runningSince)}</span>
        </div>
      )}

      <div className={"mt-3 grid grid-cols-3 gap-2 " + (running && status?.runningSince ? "" : "border-t border-ink/5 pt-3")}>
        <Detail icon={Package} label={isLive ? "Today's Loads" : periodLabel} value={String(loads)} />
        {isLive && running && status?.runningSince && (
          <Detail icon={Clock} label="Started At" value={formatClock(status.runningSince)} />
        )}
        {isLive && !running && !offline && status?.idleSince && (
          <Detail icon={Clock} label="Idle Since" value={formatClock(status.idleSince)} />
        )}
        {isLive && (
          <Detail
            icon={History}
            label="Last Used"
            value={status?.lastUsedAt ? formatDateTime(status.lastUsedAt) : "Never"}
          />
        )}
      </div>

      {isLive && sensor && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <SensorReadingChart
            history={history}
            idleBaseline={sensor.idle_baseline}
            runningBaseline={sensor.running_baseline}
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex w-full items-center justify-between text-xs font-semibold text-ink/60"
          >
            <span>
              View load history ({logs.length})
            </span>
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              className={"transition-transform " + (expanded ? "rotate-180" : "")}
            />
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-page px-2.5 py-2 text-xs"
                >
                  <span className="text-ink/70">
                    {log.started_at ? formatDateTime(log.started_at) : "Start not recorded"}
                    {" → "}
                    {formatDateTime(log.completed_at)}
                  </span>
                  <span className="shrink-0 font-semibold text-ink/50">
                    {log.started_at ? formatLoadDuration(log.started_at, log.completed_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-page text-ink/40">
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] text-ink/40">{label}</p>
        <p className="truncate text-xs font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
