import type { Worker } from "../types";

export const STANDARD_SHIFT_HOURS = 8;
// Used only to derive an hourly-equivalent rate for daily/monthly workers, so overtime/undertime
// (always logged in hours in Attendance) can be valued in pesos regardless of pay type.
export const STANDARD_WORK_DAYS_PER_MONTH = 26;

export function hourlyEquivalent(payType: Worker["pay_type"], rate: number): number {
  if (payType === "hourly") return rate;
  if (payType === "daily") return rate / STANDARD_SHIFT_HOURS;
  if (payType === "monthly") return rate / (STANDARD_WORK_DAYS_PER_MONTH * STANDARD_SHIFT_HOURS);
  return 0; // per_piece has no time-based rate.
}

export interface GrossPayInput {
  payType: Worker["pay_type"];
  rate: number;
  /** present = 1, half_day = 0.5, summed across the period. Absent/leave contribute 0 —
   * there's no paid/unpaid leave distinction tracked yet, so leave defaults to unpaid. */
  fullDays: number;
  /** sum(hours_worked - overtime_hours) across the period; hourly base pay excludes OT hours
   * since Attendance already folds them into hours_worked. */
  regularHours: number;
  overtimeHours: number;
  undertimeHours: number;
  overtimeMultiplier: number;
}

export interface GrossPayBreakdown {
  basePay: number;
  overtimePay: number;
  undertimeDeduction: number;
  total: number;
}

/** Per-piece pay type has no piece-count data anywhere in the app, so it always returns 0 —
 * gross pay for those workers is entered manually on the payslip. */
export function computeGrossPayBreakdown(input: GrossPayInput): GrossPayBreakdown {
  const { payType, rate, fullDays, regularHours, overtimeHours, undertimeHours, overtimeMultiplier } = input;

  if (payType === "per_piece") return { basePay: 0, overtimePay: 0, undertimeDeduction: 0, total: 0 };

  const hourly = hourlyEquivalent(payType, rate);
  const overtimePay = overtimeHours * hourly * overtimeMultiplier;

  if (payType === "hourly") {
    const basePay = regularHours * rate;
    return { basePay, overtimePay, undertimeDeduction: 0, total: Math.max(0, basePay + overtimePay) };
  }

  const undertimeDeduction = undertimeHours * hourly;

  if (payType === "daily") {
    const basePay = fullDays * rate;
    return { basePay, overtimePay, undertimeDeduction, total: Math.max(0, basePay + overtimePay - undertimeDeduction) };
  }

  // monthly: paid per day actually attended, valued at the monthly rate divided across standard
  // working days — mirrors "daily" so absences reduce pay the same way. This used to prorate by
  // periodDays (the payroll period's calendar span) with no regard for attendance at all, so a
  // worker with zero attendance for the whole period still got close to a full month's pay.
  const dailyRate = rate / STANDARD_WORK_DAYS_PER_MONTH;
  const basePay = fullDays * dailyRate;
  return { basePay, overtimePay, undertimeDeduction, total: Math.max(0, basePay + overtimePay - undertimeDeduction) };
}

export function computeGrossPay(input: GrossPayInput): number {
  return computeGrossPayBreakdown(input).total;
}

function formatHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * Spells out how computeGrossPayBreakdown()'s basePay actually got to its number — e.g.
 * "8 days × ₱384.62/day" — so a monthly/daily figure that looks surprisingly low is traceable to
 * attendance at a glance instead of looking like a miscalculation. Shared by the payroll run
 * list, the on-screen payslip, and the downloaded payslip PDF so the three describe the same
 * number the same way instead of drifting.
 */
export function describeBasicSalary(input: {
  payType: Worker["pay_type"];
  rate: number;
  fullDays: number;
  regularHours: number;
}): string {
  const { payType, rate, fullDays, regularHours } = input;
  const days = `${fullDays} day${fullDays === 1 ? "" : "s"}`;
  if (payType === "hourly") return `${formatHM(regularHours)} × ₱${rate.toFixed(2)}/hr`;
  if (payType === "daily") return `${days} × ₱${rate.toFixed(2)}/day`;
  if (payType === "monthly") return `${days} × ₱${(rate / STANDARD_WORK_DAYS_PER_MONTH).toFixed(2)}/day`;
  return "Entered manually";
}

/**
 * Shared attendance-aggregation SQL fragments, used by both PayrollRunForm.tsx (bulk, all
 * workers) and payslipData.ts (single worker) so the two can't drift out of sync the way they
 * did before. Each expects the attendance table aliased as `a` in the query's FROM/JOIN.
 *
 * UNDERTIME_HOURS_SQL treats a row with a time_in but no time_out, on a day before today, as a
 * full day's undertime instead of the stored (default 0) value — a worker who clocked in and
 * never clocked out otherwise got full base pay for that day with zero undertime penalty, while
 * a worker who *did* clock out late got docked. Its `?` must be bound to today's date
 * ("YYYY-MM-DD"), and — because it appears in the SELECT list — must be the *first* parameter
 * bound, ahead of whatever date-range params the surrounding query adds afterward.
 */
export const FULL_DAYS_SQL =
  "COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 WHEN a.status = 'half_day' THEN 0.5 ELSE 0 END), 0)";
export const REGULAR_HOURS_SQL = "COALESCE(SUM(COALESCE(a.hours_worked, 0) - COALESCE(a.overtime_hours, 0)), 0)";
export const OVERTIME_HOURS_SQL = "COALESCE(SUM(a.overtime_hours), 0)";
export const UNDERTIME_HOURS_SQL = `COALESCE(SUM(
  CASE WHEN a.time_in IS NOT NULL AND a.time_out IS NULL AND a.work_date < ? THEN ${STANDARD_SHIFT_HOURS}
       ELSE COALESCE(a.undertime_hours, 0)
  END
), 0)`;
