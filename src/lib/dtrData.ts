import { select } from "./db";
import type { Attendance } from "../types";
import type { DtrReportDay } from "./dtrReport";

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** One row per calendar day in [from, to] for a worker, filling gaps where no attendance record exists. */
export async function fetchDtrDays(workerId: number | string, from: string, to: string): Promise<DtrReportDay[]> {
  const attendance = await select<Attendance>(
    "SELECT * FROM attendance WHERE worker_id = ? AND work_date >= ? AND work_date <= ? ORDER BY work_date",
    [workerId, from, to],
  );
  const byDate = new Map(attendance.map((a) => [a.work_date, a]));
  return datesBetween(from, to).map((date) => {
    const a = byDate.get(date);
    return {
      work_date: date,
      time_in: a?.time_in ?? null,
      time_out: a?.time_out ?? null,
      hours_worked: a?.hours_worked ?? null,
      overtime_hours: a?.overtime_hours ?? 0,
      undertime_hours: a?.undertime_hours ?? 0,
      status: a?.status ?? null,
    };
  });
}

export function sumDtrTotals(days: DtrReportDay[]) {
  return days.reduce(
    (acc, d) => ({
      hours: acc.hours + (d.hours_worked ?? 0),
      overtime: acc.overtime + d.overtime_hours,
      undertime: acc.undertime + d.undertime_hours,
    }),
    { hours: 0, overtime: 0, undertime: 0 },
  );
}
