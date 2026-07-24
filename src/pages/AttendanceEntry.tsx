import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, LogIn, LogOut, ArrowRightCircle, ArrowLeftCircle, Clock3, IdCard, Save } from "lucide-react";
import { execute, select } from "../lib/db";
import { useAuth } from "../lib/auth";
import type { Attendance, Worker } from "../types";
import { formatTime, isLate } from "./Attendance";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function hoursBetween(workDate: string, timeIn: string, timeOut: string) {
  const start = new Date(`${workDate}T${timeIn}:00`);
  const end = new Date(`${workDate}T${timeOut}:00`);
  const diff = (end.getTime() - start.getTime()) / 3_600_000;
  return diff > 0 ? diff : 0;
}

const STANDARD_SHIFT_HOURS = 8;
const NOTES_MAX = 200;

export default function AttendanceEntry() {
  const { workerId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasAccess } = useAuth();
  const canClockOut = hasAccess("attendance_clockout");
  const date = searchParams.get("date") || today();
  const backTo = `/attendance?date=${date}`;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [record, setRecord] = useState<Attendance | null>(null);
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [undertimeHours, setUndertimeHours] = useState("0");
  const [notes, setNotes] = useState("");
  const [manualTimeOut, setManualTimeOut] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [[w], [a]] = await Promise.all([
      select<Worker>("SELECT * FROM workers WHERE id = ?", [workerId]),
      select<Attendance>("SELECT * FROM attendance WHERE worker_id = ? AND work_date = ?", [workerId, date]),
    ]);
    setWorker(w ?? null);
    setRecord(a ?? null);
    setOvertimeHours(String(a?.overtime_hours ?? 0));
    setUndertimeHours(String(a?.undertime_hours ?? 0));
    setNotes(a?.notes ?? "");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId, date]);

  async function clockIn() {
    setSaving(true);
    setError(null);
    try {
      await execute(
        `INSERT INTO attendance (worker_id, work_date, time_in, status)
         VALUES (?, ?, ?, 'present')
         ON CONFLICT(worker_id, work_date) DO UPDATE SET time_in = excluded.time_in, status = 'present'`,
        [workerId, date, currentTime()],
      );
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clockOut(timeOut: string = currentTime()) {
    if (!record?.time_in) return;
    setSaving(true);
    setError(null);
    try {
      const hrs = hoursBetween(date, record.time_in, timeOut);
      const ot = Math.max(0, hrs - STANDARD_SHIFT_HOURS);
      const ut = Math.max(0, STANDARD_SHIFT_HOURS - hrs);
      await execute(
        `UPDATE attendance
         SET time_out = ?, hours_worked = ?, overtime_hours = ?, undertime_hours = ?
         WHERE worker_id = ? AND work_date = ?`,
        [timeOut, hrs, ot, ut, workerId, date],
      );
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function markStatus(status: "absent" | "leave") {
    setSaving(true);
    setError(null);
    try {
      await execute(
        `INSERT INTO attendance (worker_id, work_date, status)
         VALUES (?, ?, ?)
         ON CONFLICT(worker_id, work_date) DO UPDATE SET status = excluded.status`,
        [workerId, date, status],
      );
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustments() {
    const ot = Number(overtimeHours);
    const ut = Number(undertimeHours);
    if (!(ot >= 0) || !(ut >= 0)) {
      setError("Enter valid overtime/undertime values.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await execute(
        `UPDATE attendance SET overtime_hours = ?, undertime_hours = ?, notes = ? WHERE worker_id = ? AND work_date = ?`,
        [ot, ut, notes.trim() || null, workerId, date],
      );
      navigate(backTo);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!worker) return null;

  const statusMeta =
    record?.status === "absent"
      ? { label: "Absent", className: "from-red-600 to-red-500" }
      : record?.status === "leave"
        ? { label: "On Leave", className: "from-purple-600 to-purple-500" }
        : record?.time_in && isLate(record)
          ? { label: "Late", className: "from-amber-600 to-amber-500" }
          : record?.time_in
            ? { label: "Present", className: "from-emerald-600 to-emerald-500" }
            : { label: "Not clocked in", className: "from-gray-500 to-gray-400" };

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={backTo}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{worker.full_name}</h1>
          <p className="truncate text-xs text-ink/50">{date}</p>
        </div>
        <Link
          to={`/attendance/${workerId}/dtr`}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-brand-500/30 bg-surface px-3.5 text-xs font-semibold text-brand-500 shadow-sm"
        >
          <Clock3 size={15} strokeWidth={2.2} />
          Monthly DTR
        </Link>
      </div>

      <div
        className={"relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-sm " + statusMeta.className}
      >
        <IdCard size={80} strokeWidth={1.2} className="pointer-events-none absolute -right-3 -bottom-4 text-white/15" />
        <p className="text-xs font-medium text-white/80">Status</p>
        <p className="mt-0.5 text-2xl font-bold">{statusMeta.label}</p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {record?.status === "absent" || record?.status === "leave" ? (
        <div className="mb-3 rounded-2xl bg-surface p-4 text-center shadow-sm">
          <p className="mb-3 text-sm font-semibold text-ink">
            Marked {record.status === "absent" ? "absent" : "on leave"}
          </p>
          <button
            type="button"
            onClick={clockIn}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            <LogIn size={16} strokeWidth={2.2} />
            Clock In Instead
          </button>
        </div>
      ) : !record?.time_in ? (
        <button
          type="button"
          onClick={clockIn}
          disabled={saving}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-5 text-base font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <LogIn size={20} strokeWidth={2.2} />
          Clock In
        </button>
      ) : (
        <>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Time Summary</p>
          <div className="mb-3 space-y-2.5 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-ink/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <ArrowRightCircle size={14} strokeWidth={2.2} />
                </span>
                Time In
              </span>
              <span className="font-semibold text-ink">{formatTime(record.time_in)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-ink/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
                  <ArrowLeftCircle size={14} strokeWidth={2.2} />
                </span>
                Time Out
              </span>
              <span className="font-semibold text-ink">
                {record.time_out ? formatTime(record.time_out) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-ink/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Clock3 size={14} strokeWidth={2.2} />
                </span>
                Hours Worked
              </span>
              <span className="font-semibold text-ink">{(record.hours_worked ?? 0).toFixed(2)} hrs</span>
            </div>
          </div>

          {!record.time_out ? (
            canClockOut ? (
              <>
                <button
                  type="button"
                  onClick={() => clockOut()}
                  disabled={saving}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-5 text-base font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  <LogOut size={20} strokeWidth={2.2} />
                  Clock Out
                </button>

                <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
                  Forgot to clock out?
                </p>
                <p className="mb-2 px-1 text-[11px] text-ink/40">
                  Set their actual time out instead of using the button above (which uses right now).
                </p>
                <div className="mb-3 flex items-center gap-2 rounded-2xl bg-surface p-3.5 shadow-sm">
                  <input
                    type="time"
                    value={manualTimeOut}
                    onChange={(e) => setManualTimeOut(e.target.value)}
                    className="flex-1 text-sm font-medium text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => clockOut(manualTimeOut)}
                    disabled={saving || !manualTimeOut}
                    className="shrink-0 rounded-xl bg-surface-muted px-3.5 py-2.5 text-xs font-semibold text-ink disabled:opacity-50"
                  >
                    Set Time Out
                  </button>
                </div>
              </>
            ) : (
              <p className="mb-3 rounded-2xl bg-surface p-4 text-center text-xs text-ink/40">
                You don't have permission to clock employees out. Ask an owner or manager.
              </p>
            )
          ) : (
            <>
              <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
                Overtime &amp; Undertime
              </p>
              <p className="mb-2 px-1 text-[11px] text-ink/40">
                Against an {STANDARD_SHIFT_HOURS}-hour day · auto-filled, editable
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
                  <span className="mb-1 block text-xs font-medium text-ink/50">Overtime hours</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    className="w-full text-sm font-medium text-ink outline-none"
                  />
                </label>
                <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
                  <span className="mb-1 block text-xs font-medium text-ink/50">Undertime hours</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={undertimeHours}
                    onChange={(e) => setUndertimeHours(e.target.value)}
                    className="w-full text-sm font-medium text-ink outline-none"
                  />
                </label>
              </div>

              <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
                Notes (Optional)
              </p>
              <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-sm">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                  placeholder="Add a note…"
                  rows={3}
                  className="w-full resize-none text-sm text-ink outline-none placeholder:text-ink/30"
                />
                <p className="mt-1 text-right text-[10px] text-ink/30">
                  {notes.length}/{NOTES_MAX}
                </p>
              </div>

              <button
                type="button"
                onClick={saveAdjustments}
                disabled={saving}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              >
                <Save size={16} strokeWidth={2.2} />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </>
      )}

      {!record?.time_in && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => markStatus("absent")}
            disabled={saving}
            className="rounded-2xl bg-surface py-3 text-sm font-semibold text-ink/70 shadow-sm disabled:opacity-60"
          >
            Mark Absent
          </button>
          <button
            type="button"
            onClick={() => markStatus("leave")}
            disabled={saving}
            className="rounded-2xl bg-surface py-3 text-sm font-semibold text-ink/70 shadow-sm disabled:opacity-60"
          >
            Mark on Leave
          </button>
        </div>
      )}
    </div>
  );
}
