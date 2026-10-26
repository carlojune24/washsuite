import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { execute, select } from "./db";
import { effectiveStatus, type RosterRow } from "../pages/Attendance";
import type { CashflowEntry, PaymentMethod, PaymentStatus } from "../types";

/** Prefills the setup/reconfigure form -- editable, not baked into any request path. */
export const DEFAULT_MONITOR_SERVER_URL = "https://washsuite.duckdns.org";

export interface MonitoringState {
  shop_id: string;
  api_token: string;
  dashboard_url: string | null;
  server_url: string;
  enabled: number;
  last_push_at: string | null;
  last_push_ok: number | null;
  last_push_error: string | null;
}

export interface MonitoringSnapshotSales {
  today_total: number;
  today_orders: number;
  yesterday_total: number;
}

export interface MonitoringExpenseEntry {
  description: string;
  category: string | null;
  amount: number;
  expense_date: string;
}

export interface MonitoringSnapshotCashflow {
  today_income: number;
  today_expense: number;
  today_net: number;
  cash_on_hand: number;
  by_method: Record<PaymentMethod, number>;
  expenses_today: MonitoringExpenseEntry[];
}

export interface MonitoringRosterEntry {
  worker_id: number;
  full_name: string;
  position: string | null;
  status: string;
  time_in: string | null;
  time_out: string | null;
}

export interface MonitoringSnapshotAttendance {
  present: number;
  late: number;
  absent: number;
  not_clocked_in: number;
  roster: MonitoringRosterEntry[];
}

export interface MonitoringMachineEntry {
  machine_id: number;
  name: string;
  type: string;
  status: "running" | "idle" | "offline";
  loads_today: number;
  last_used_at: string | null;
}

export interface MonitoringSnapshotMachines {
  total_loads_today: number;
  machines: MonitoringMachineEntry[];
}

export interface MonitoringSnapshot {
  captured_at: string;
  snapshot_date: string;
  app_version: string;
  sales: MonitoringSnapshotSales;
  cashflow: MonitoringSnapshotCashflow;
  attendance: MonitoringSnapshotAttendance;
  machines: MonitoringSnapshotMachines;
}

export async function loadMonitoringState(): Promise<MonitoringState | null> {
  const rows = await select<MonitoringState>("SELECT * FROM monitoring_state WHERE id = 1");
  return rows[0] ?? null;
}

export async function saveMonitoringState(
  shopId: string,
  apiToken: string,
  dashboardUrl: string | null,
  serverUrl: string,
): Promise<void> {
  await execute(
    `INSERT INTO monitoring_state (id, shop_id, api_token, dashboard_url, server_url)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       shop_id = excluded.shop_id,
       api_token = excluded.api_token,
       dashboard_url = excluded.dashboard_url,
       server_url = excluded.server_url,
       updated_at = datetime('now')`,
    [shopId, apiToken, dashboardUrl, serverUrl],
  );
}

export async function setMonitoringEnabled(enabled: boolean): Promise<void> {
  await execute("UPDATE monitoring_state SET enabled = ?, updated_at = datetime('now') WHERE id = 1", [enabled ? 1 : 0]);
}

async function recordPushResult(ok: boolean, error: string | null): Promise<void> {
  await execute(
    "UPDATE monitoring_state SET last_push_at = datetime('now'), last_push_ok = ?, last_push_error = ? WHERE id = 1",
    [ok ? 1 : 0, error],
  );
}

/** Registers this install with the monitoring server and caches the returned token locally. */
export async function registerMonitoring(
  licenseKey: string,
  shopName: string,
  dashboardPassword: string,
  serverUrl: string,
): Promise<MonitoringState> {
  const appVersion = await getVersion();
  const result = await invoke<{ shop_id: string; api_token: string }>("register_monitoring", {
    licenseKey,
    shopName,
    dashboardPassword,
    appVersion,
    serverUrl,
  });
  // No dashboard domain yet (plain-HTTP testing) -- server/README.md documents the endpoint
  // shape once a real domain exists; nothing here builds a shareable URL until then.
  await saveMonitoringState(result.shop_id, result.api_token, null, serverUrl.trim().replace(/\/+$/, ""));
  return (await loadMonitoringState())!;
}

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD, not UTC
}

async function buildSalesSnapshot(date: string): Promise<MonitoringSnapshotSales> {
  const [[today], [yesterday]] = await Promise.all([
    select<{ total: number | null; c: number }>(
      "SELECT SUM(grand_total) as total, COUNT(*) as c FROM orders WHERE status != 'cancelled' AND date(drop_off_at, 'localtime') = date(?)",
      [date],
    ),
    select<{ total: number | null }>(
      "SELECT SUM(grand_total) as total FROM orders WHERE status != 'cancelled' AND date(drop_off_at, 'localtime') = date(?, '-1 day')",
      [date],
    ),
  ]);
  return {
    today_total: today?.total ?? 0,
    today_orders: today?.c ?? 0,
    yesterday_total: yesterday?.total ?? 0,
  };
}

interface CashRow extends CashflowEntry {
  order_payment_status: PaymentStatus | null;
}

// Mirrors SOURCE_META labels in ReportCashflowSource.tsx.
const EXPENSE_SOURCE_LABEL: Record<CashflowEntry["source"], string> = {
  sale: "Sale",
  expense: "Expense",
  restock: "Restock",
  payroll: "Payroll",
  government: "Government Remittance",
  adjustment: "Adjustment",
};

/**
 * Mirrors Cashflow.tsx's running-balance logic exactly (see withBalance/cashOnHand/cashBreakdown
 * there): a receivable (unpaid sale) doesn't move cash on hand yet. cash_on_hand/by_method are
 * bounded to entries on or before `date` -- for the live "today" push that's every entry that
 * exists (nothing is ever future-dated in normal use), and for a backfilled past date it's the
 * true running balance as of the end of that day, not today's live balance mislabeled.
 * today_income/expense are bounded to exactly `date`. expenses_today is itemized from this same
 * entries query (not the separate `expenses` table) so it always sums to today_expense --
 * restock/payroll/government/adjustment cash-outs are expenses too, not just the manual Expense form.
 */
async function buildCashflowSnapshot(date: string): Promise<MonitoringSnapshotCashflow> {
  const entries = await select<CashRow>(
    `SELECT e.*, o.payment_status AS order_payment_status
     FROM cashflow_entries e
     LEFT JOIN orders o ON e.source = 'sale' AND e.source_id = o.id
     ORDER BY e.entry_date ASC`,
  );

  let cashOnHand = 0;
  const byMethod: Record<PaymentMethod, number> = { cash: 0, gcash: 0, card: 0, bank_transfer: 0 };
  let todayIncome = 0;
  let todayExpense = 0;
  const expensesToday: MonitoringExpenseEntry[] = [];

  for (const e of entries) {
    const entryDate = e.entry_date.slice(0, 10);
    if (entryDate > date) continue;

    const receivable = e.source === "sale" && e.order_payment_status !== "paid";
    const signedAmount = e.entry_type === "income" ? e.amount : -e.amount;
    if (!receivable) {
      cashOnHand += signedAmount;
      if (e.method) byMethod[e.method] += signedAmount;
    }
    if (entryDate === date) {
      if (e.entry_type === "income" && !receivable) todayIncome += e.amount;
      if (e.entry_type === "expense") {
        todayExpense += e.amount;
        expensesToday.push({
          description: e.description ?? EXPENSE_SOURCE_LABEL[e.source],
          category: EXPENSE_SOURCE_LABEL[e.source],
          amount: e.amount,
          expense_date: e.entry_date,
        });
      }
    }
  }

  expensesToday.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));

  return {
    today_income: todayIncome,
    today_expense: todayExpense,
    today_net: todayIncome - todayExpense,
    cash_on_hand: cashOnHand,
    by_method: byMethod,
    expenses_today: expensesToday,
  };
}

/** Mirrors Attendance.tsx's roster query + effectiveStatus, scoped to `date`. */
async function buildAttendanceSnapshot(date: string): Promise<MonitoringSnapshotAttendance> {
  const rows = await select<RosterRow>(
    `SELECT w.id as worker_id, w.full_name, w.position,
            a.time_in, a.time_out, a.hours_worked, a.overtime_hours, a.undertime_hours, a.status
     FROM workers w
     LEFT JOIN attendance a ON a.worker_id = w.id AND a.work_date = ?
     WHERE w.is_active = 1
     ORDER BY w.full_name`,
    [date],
  );

  let present = 0;
  let late = 0;
  let absent = 0;
  let notClockedIn = 0;
  for (const r of rows) {
    const eff = effectiveStatus(r);
    if (eff === "present") present++;
    else if (eff === "late") late++;
    else if (eff === "absent") absent++;
    else if (eff === "not_clocked_in") notClockedIn++;
  }

  return {
    present,
    late,
    absent,
    not_clocked_in: notClockedIn,
    roster: rows.map((r) => ({
      worker_id: r.worker_id,
      full_name: r.full_name,
      position: r.position,
      status: effectiveStatus(r),
      time_in: r.time_in,
      time_out: r.time_out,
    })),
  };
}

/**
 * Assembles the full snapshot for `date` (defaults to today). The machines block is supplied by
 * the caller (see <MonitoringSync /> in src/lib/monitoringSync.tsx) rather than queried here,
 * since live running/idle state only exists in MachineStatusProvider's in-memory context -- it's
 * never persisted per-reading to SQLite (see src/lib/machineStatus.tsx), so there's no way to
 * reconstruct it for a past date. Callers backfilling a past date should pass an empty machines
 * block ({ total_loads_today: 0, machines: [] }) rather than today's live status mislabeled.
 */
export async function buildSnapshot(machines: MonitoringSnapshotMachines, date: string = todayDateStr()): Promise<MonitoringSnapshot> {
  const [sales, cashflow, attendance, appVersion] = await Promise.all([
    buildSalesSnapshot(date),
    buildCashflowSnapshot(date),
    buildAttendanceSnapshot(date),
    getVersion(),
  ]);

  return {
    captured_at: new Date().toISOString(),
    snapshot_date: date,
    app_version: appVersion,
    sales,
    cashflow,
    attendance,
    machines,
  };
}

/** Builds and pushes a snapshot for `date` (defaults to today) right now, recording the outcome
 * in monitoring_state regardless of success or failure so the Settings UI always reflects the
 * most recent attempt. */
export async function pushSnapshotNow(machines: MonitoringSnapshotMachines, date?: string): Promise<void> {
  const state = await loadMonitoringState();
  if (!state) throw new Error("Monitoring isn't enabled on this device yet.");

  try {
    const snapshot = await buildSnapshot(machines, date);
    await invoke("push_monitoring_snapshot", { apiToken: state.api_token, snapshot, serverUrl: state.server_url });
    await recordPushResult(true, null);
  } catch (err) {
    await recordPushResult(false, String(err));
    throw err;
  }
}
