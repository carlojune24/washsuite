import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Users, CheckCircle2, Clock, XCircle, Search } from "lucide-react";
import { select } from "../lib/db";
import { EmptyState, PageHeading } from "../components/ListRow";
import { localDate } from "../lib/localDate";

export interface RosterRow {
  worker_id: number;
  full_name: string;
  position: string | null;
  time_in: string | null;
  time_out: string | null;
  hours_worked: number | null;
  overtime_hours: number | null;
  undertime_hours: number | null;
  status: string | null;
}

type StatusFilter = "all" | "present" | "late" | "absent" | "leave";

function today() {
  return localDate(new Date());
}

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Simple heuristic: clocked in after this time counts as "Late" for display only —
// doesn't change the stored `status`, since there's no shift-time setting yet to derive it from.
export const LATE_CUTOFF = "09:00";

export function isLate(r: { status: string | null; time_in: string | null }) {
  return r.status === "present" && !!r.time_in && r.time_in > LATE_CUTOFF;
}

export function effectiveStatus(r: RosterRow): "present" | "late" | "absent" | "leave" | "half_day" | "not_clocked_in" {
  if (r.status === "absent") return "absent";
  if (r.status === "leave") return "leave";
  if (r.status === "half_day") return "half_day";
  if (isLate(r)) return "late";
  if (r.time_in) return "present";
  return "not_clocked_in";
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  present: { label: "Present", className: "bg-emerald-100 text-emerald-700" },
  late: { label: "Late", className: "bg-amber-100 text-amber-700" },
  absent: { label: "Absent", className: "bg-red-100 text-red-600" },
  leave: { label: "On Leave", className: "bg-purple-100 text-purple-700" },
  half_day: { label: "Half Day", className: "bg-blue-100 text-blue-700" },
  not_clocked_in: { label: "Not clocked in", className: "bg-gray-100 text-gray-500" },
};

const AVATAR_PALETTE = [
  "bg-pink-100 text-pink-600",
  "bg-blue-100 text-blue-600",
  "bg-purple-100 text-purple-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-cyan-100 text-cyan-600",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function timeSubtitle(r: RosterRow) {
  if (r.status === "absent") return "Absent";
  if (r.status === "leave") return "On leave";
  if (r.time_in && r.time_out) {
    const hrs = r.hours_worked != null ? ` · ${r.hours_worked.toFixed(2)} hrs` : "";
    return `${formatTime(r.time_in)} - ${formatTime(r.time_out)}${hrs}`;
  }
  if (r.time_in) return `Clocked in at ${formatTime(r.time_in)}`;
  return "Not clocked in";
}

export default function Attendance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") || today());
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    select<RosterRow>(
      `SELECT w.id as worker_id, w.full_name, w.position,
              a.time_in, a.time_out, a.hours_worked, a.overtime_hours, a.undertime_hours, a.status
       FROM workers w
       LEFT JOIN attendance a ON a.worker_id = w.id AND a.work_date = ?
       WHERE w.is_active = 1
       ORDER BY w.full_name`,
      [date],
    ).then(setRows);
  }, [date]);

  function handleDateChange(next: string) {
    setDate(next);
    setSearchParams(next === today() ? {} : { date: next });
  }

  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const r of rows) {
      const eff = effectiveStatus(r);
      if (eff === "present") present++;
      else if (eff === "late") late++;
      else if (eff === "absent") absent++;
    }
    return { total: rows.length, present, late, absent };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.full_name.toLowerCase().includes(q) && !(r.position ?? "").toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && effectiveStatus(r) !== statusFilter) return false;
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  return (
    <div>
      <PageHeading title="Attendance" hint="Track and manage employee attendance." />

      <label className="mb-4 block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="w-full text-sm text-ink outline-none"
        />
      </label>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Users size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.total}</p>
          <p className="truncate text-[9px] text-ink/50">Total Employees</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.present}</p>
          <p className="truncate text-[9px] text-ink/50">Present</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Clock size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.late}</p>
          <p className="truncate text-[9px] text-ink/50">Late</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <XCircle size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.absent}</p>
          <p className="truncate text-[9px] text-ink/50">Absent</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1.5">
        <label className="flex flex-1 items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
          <Search size={16} strokeWidth={2.2} className="text-ink/30" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee…"
            className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="shrink-0 rounded-2xl bg-surface px-3 text-xs font-semibold text-ink/60 shadow-sm outline-none"
        >
          <option value="all">All Status</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="leave">On Leave</option>
        </select>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Attendance List</p>

      {filtered.length === 0 && (
        <EmptyState text={rows.length === 0 ? "No active workers." : "No workers match your filters."} />
      )}

      <ul className="space-y-2">
        {filtered.map((r) => {
          const meta = STATUS_META[effectiveStatus(r)];
          return (
            <li key={r.worker_id}>
              <Link
                to={`/attendance/${r.worker_id}?date=${date}`}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm"
              >
                <span
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                    avatarColor(r.full_name)
                  }
                >
                  {r.full_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.full_name}</p>
                  <p className="truncate text-xs text-ink/40">{timeSubtitle(r)}</p>
                </div>
                <span className={"shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " + meta.className}>
                  {meta.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
