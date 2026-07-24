import { select } from "./db";
import {
  computeGrossPayBreakdown,
  describeBasicSalary,
  FULL_DAYS_SQL,
  REGULAR_HOURS_SQL,
  OVERTIME_HOURS_SQL,
  UNDERTIME_HOURS_SQL,
  type GrossPayBreakdown,
} from "./payroll";
import type { CashAdvance, PayrollRun, PayrollSettings, Payslip, Worker, WorkerDeduction } from "../types";
import type { PayslipReportOptions } from "./payslipReport";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const PAY_TYPE_LABEL: Record<Worker["pay_type"], string> = {
  daily: "Daily",
  hourly: "Hourly",
  monthly: "Monthly",
  per_piece: "Per Piece",
};

export function employeeIdFor(worker: Worker) {
  return `EMP-${String(worker.id).padStart(5, "0")}`;
}

export function periodLabel(run: PayrollRun) {
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(run.period_start)} – ${fmt(run.period_end)}`;
}

function daysBetweenInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export interface PayslipDeductionRow extends WorkerDeduction {
  deduction_name: string;
}

export interface PayslipAttendanceAgg {
  full_days: number;
  regular_hours: number;
  overtime_hours: number;
  undertime_hours: number;
  total_hours: number;
}

export interface PayslipData {
  run: PayrollRun;
  worker: Worker;
  payslip: Payslip;
  deductions: PayslipDeductionRow[];
  cashAdvanceTotal: number;
  overtimeMultiplier: number;
  agg: PayslipAttendanceAgg;
  periodDays: number;
  breakdown: GrossPayBreakdown;
  /** Live (attendance-derived) until paid, then frozen to whatever was actually paid. */
  grossPay: number;
  /** Live (current worker_deductions) until paid, then frozen to whatever was actually paid. */
  employeeDeductionsTotal: number;
  netPay: number;
  totalDeductions: number;
}

/** Fetches and computes everything needed to render or export a worker's payslip for a run. */
export async function fetchPayslipData(runId: number | string, workerId: number | string): Promise<PayslipData | null> {
  const [[run], [worker], [payslip]] = await Promise.all([
    select<PayrollRun>("SELECT * FROM payroll_runs WHERE id = ?", [runId]),
    select<Worker>("SELECT * FROM workers WHERE id = ?", [workerId]),
    select<Payslip>("SELECT * FROM payslips WHERE payroll_run_id = ? AND worker_id = ?", [runId, workerId]),
  ]);
  if (!run || !worker || !payslip) return null;

  const [deductions, advances, [settings], [attAgg]] = await Promise.all([
    select<PayslipDeductionRow>(
      `SELECT wd.*, dt.name AS deduction_name
       FROM worker_deductions wd
       JOIN deduction_types dt ON dt.id = wd.deduction_type_id
       WHERE wd.worker_id = ? AND wd.is_active = 1
       ORDER BY dt.name`,
      [workerId],
    ),
    payslip.paid_at
      ? select<CashAdvance>("SELECT * FROM cash_advances WHERE payslip_id = ?", [payslip.id])
      : select<CashAdvance>("SELECT * FROM cash_advances WHERE worker_id = ? AND status = 'outstanding'", [workerId]),
    select<PayrollSettings>("SELECT * FROM payroll_settings WHERE id = 1"),
    select<PayslipAttendanceAgg>(
      `SELECT
         ${FULL_DAYS_SQL} AS full_days,
         ${REGULAR_HOURS_SQL} AS regular_hours,
         ${OVERTIME_HOURS_SQL} AS overtime_hours,
         ${UNDERTIME_HOURS_SQL} AS undertime_hours,
         COALESCE(SUM(a.hours_worked), 0) AS total_hours
       FROM attendance a
       WHERE a.worker_id = ? AND a.work_date >= ? AND a.work_date <= ?`,
      [today(), workerId, run.period_start, run.period_end],
    ),
  ]);

  const cashAdvanceTotal = advances.reduce((s, a) => s + a.amount, 0);
  const overtimeMultiplier = settings?.overtime_multiplier ?? 1.25;
  const periodDays = daysBetweenInclusive(run.period_start, run.period_end);
  const agg = attAgg ?? { full_days: 0, regular_hours: 0, overtime_hours: 0, undertime_hours: 0, total_hours: 0 };

  const breakdown = computeGrossPayBreakdown({
    payType: worker.pay_type,
    rate: worker.rate,
    fullDays: agg.full_days,
    regularHours: agg.regular_hours,
    overtimeHours: agg.overtime_hours,
    undertimeHours: agg.undertime_hours,
    overtimeMultiplier,
  });

  // Once paid, gross pay/deductions are frozen historical fact (what was actually paid out); until
  // then they're derived live from current attendance/deduction assignments, so editing attendance
  // on an unpaid payslip is reflected immediately instead of silently drifting from what gets paid.
  const isPaid = !!payslip.paid_at;
  const grossPay = isPaid ? payslip.gross_pay : breakdown.total;
  const employeeDeductionsTotal = isPaid
    ? payslip.deductions
    : deductions.reduce((s, d) => s + d.employee_share, 0);
  const totalDeductions = employeeDeductionsTotal + cashAdvanceTotal;
  const netPay = isPaid ? payslip.net_pay : Math.max(0, grossPay - employeeDeductionsTotal - cashAdvanceTotal);

  return {
    run,
    worker,
    payslip,
    deductions,
    cashAdvanceTotal,
    overtimeMultiplier,
    agg,
    periodDays,
    breakdown,
    grossPay,
    employeeDeductionsTotal,
    netPay,
    totalDeductions,
  };
}

export function toPayslipReportOptions(data: PayslipData, businessName: string): PayslipReportOptions {
  return {
    businessName,
    workerName: data.worker.full_name,
    payType: PAY_TYPE_LABEL[data.worker.pay_type],
    employeeId: employeeIdFor(data.worker),
    periodLabel: periodLabel(data.run),
    netPay: data.netPay,
    grossPay: data.grossPay,
    cashAdvanceTotal: data.cashAdvanceTotal,
    basicSalary: data.breakdown.basePay,
    basicSalaryFormula: describeBasicSalary({
      payType: data.worker.pay_type,
      rate: data.worker.rate,
      fullDays: data.agg.full_days,
      regularHours: data.agg.regular_hours,
    }),
    overtimePay: data.breakdown.overtimePay,
    undertimeDeduction: data.breakdown.undertimeDeduction,
    overtimeMultiplier: data.overtimeMultiplier,
    totalEarnings: data.grossPay,
    deductions: data.deductions.map((d) => ({ name: d.deduction_name, employeeShare: d.employee_share, employerShare: d.employer_share })),
    totalDeductions: data.totalDeductions,
    totalHours: data.agg.total_hours,
    totalOvertime: data.agg.overtime_hours,
    totalUndertime: data.agg.undertime_hours,
    totalDays: data.periodDays,
    daysPresent: data.agg.full_days,
    regularHours: data.agg.regular_hours,
  };
}
