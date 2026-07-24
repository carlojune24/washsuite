import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, CalendarRange } from "lucide-react";
import { execute, select } from "../lib/db";
import { computeGrossPay, FULL_DAYS_SQL, REGULAR_HOURS_SQL, OVERTIME_HOURS_SQL, UNDERTIME_HOURS_SQL } from "../lib/payroll";
import type { Worker, WorkerDeduction, PayrollSettings } from "../types";

interface AttendanceAgg {
  worker_id: number;
  full_days: number;
  regular_hours: number;
  overtime_hours: number;
  undertime_hours: number;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function PayrollRunForm() {
  const navigate = useNavigate();

  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [activeWorkerCount, setActiveWorkerCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<{ count: number }>("SELECT COUNT(*) AS count FROM workers WHERE is_active = 1").then(([r]) =>
      setActiveWorkerCount(r?.count ?? 0),
    );
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!periodStart || !periodEnd) {
      setError("Pick both a start and end date.");
      return;
    }
    if (periodStart > periodEnd) {
      setError("Start date must be before the end date.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const [workers, attendanceRows, deductionAssignments, [settings]] = await Promise.all([
        select<Worker>("SELECT * FROM workers WHERE is_active = 1 ORDER BY full_name"),
        select<AttendanceAgg>(
          `SELECT w.id AS worker_id,
                  ${FULL_DAYS_SQL} AS full_days,
                  ${REGULAR_HOURS_SQL} AS regular_hours,
                  ${OVERTIME_HOURS_SQL} AS overtime_hours,
                  ${UNDERTIME_HOURS_SQL} AS undertime_hours
           FROM workers w
           LEFT JOIN attendance a ON a.worker_id = w.id AND a.work_date >= ? AND a.work_date <= ?
           WHERE w.is_active = 1
           GROUP BY w.id`,
          [today(), periodStart, periodEnd],
        ),
        select<WorkerDeduction>("SELECT * FROM worker_deductions WHERE is_active = 1"),
        select<PayrollSettings>("SELECT * FROM payroll_settings WHERE id = 1"),
      ]);

      const overtimeMultiplier = settings?.overtime_multiplier ?? 1.25;
      const attendanceByWorker = new Map(attendanceRows.map((r) => [r.worker_id, r]));
      const deductionsByWorker = new Map<number, number>();
      for (const d of deductionAssignments) {
        deductionsByWorker.set(d.worker_id, (deductionsByWorker.get(d.worker_id) ?? 0) + d.employee_share);
      }

      const runRes = await execute(
        "INSERT INTO payroll_runs (period_start, period_end, status) VALUES (?, ?, 'draft')",
        [periodStart, periodEnd],
      );
      const runId = Number(runRes.lastInsertId);

      for (const w of workers) {
        const att = attendanceByWorker.get(w.id);
        const grossPay = computeGrossPay({
          payType: w.pay_type,
          rate: w.rate,
          fullDays: att?.full_days ?? 0,
          regularHours: att?.regular_hours ?? 0,
          overtimeHours: att?.overtime_hours ?? 0,
          undertimeHours: att?.undertime_hours ?? 0,
          overtimeMultiplier,
        });
        const deductions = deductionsByWorker.get(w.id) ?? 0;
        const netPay = Math.max(0, grossPay - deductions);

        await execute(
          "INSERT INTO payslips (payroll_run_id, worker_id, gross_pay, deductions, net_pay) VALUES (?, ?, ?, ?, ?)",
          [runId, w.id, grossPay, deductions, netPay],
        );
      }

      navigate(`/payroll/${runId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/payroll"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">New Payroll Run</h1>
          <p className="truncate text-xs text-ink/50">Computed from Attendance, deductions, and cash advances</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Period start</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Period end</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-brand-200/30 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
            <CalendarRange size={16} strokeWidth={2.2} />
          </span>
          <p className="text-xs text-ink/60">
            Generates a draft payslip for all <span className="font-semibold">{activeWorkerCount ?? "…"}</span> active
            worker{activeWorkerCount === 1 ? "" : "s"} — gross pay from Attendance hours and rates, government
            deductions from their current assignments. Nothing is deducted from cash advances or marked paid until
            you confirm the run.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || activeWorkerCount === 0}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Generating…" : "Generate Draft Payslips"}
        </button>
        {activeWorkerCount === 0 && (
          <p className="text-center text-xs text-ink/40">No active workers to run payroll for.</p>
        )}
      </form>
    </div>
  );
}
