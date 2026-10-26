import { select, execute } from "./db";
import type { Branch, Order, ZReading } from "../types";
import { computeVatBreakdown } from "./vat";
import { getGrandTotal } from "./grandTotal";

const TERMINAL_ID_STORAGE_KEY = "washsuite-terminal-id";
const DEFAULT_TERMINAL_ID = "MAIN";

/** Device-local terminal identity, same localStorage pattern as the printer settings in
 * printer.ts -- there's no terminal/register entity in the schema, this app runs one POS
 * per branch today, so a per-device label is enough to satisfy the "per terminal" Z-reading
 * requirement if a branch ever does run more than one register. */
export function getStoredTerminalId(): string {
  return localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || DEFAULT_TERMINAL_ID;
}

export function setStoredTerminalId(id: string): void {
  localStorage.setItem(TERMINAL_ID_STORAGE_KEY, id.trim() || DEFAULT_TERMINAL_ID);
}

export async function getLastZReading(branchId: number, terminalId: string): Promise<ZReading | null> {
  const [row] = await select<ZReading>(
    "SELECT * FROM z_readings WHERE branch_id = ? AND terminal_id = ? ORDER BY sequence_no DESC LIMIT 1",
    [branchId, terminalId],
  );
  return row ?? null;
}

export async function listZReadings(branchId: number, terminalId: string): Promise<ZReading[]> {
  return select<ZReading>(
    "SELECT * FROM z_readings WHERE branch_id = ? AND terminal_id = ? ORDER BY sequence_no DESC",
    [branchId, terminalId],
  );
}

export interface ReadingPreview {
  periodStart: string;
  periodEnd: string;
  beginningGrandTotal: number;
  endingGrandTotal: number;
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  scPwdDiscountTotal: number;
  otherDiscountTotal: number;
  cashSales: number;
  cashlessSales: number;
  transactionCount: number;
}

/**
 * Aggregates every officially-invoiced order since the last Z-reading close (or the beginning
 * of time, if there isn't one yet) into the numbers a Z-reading needs. Used both for a
 * non-committing X-reading preview and as the payload generateZReading() writes -- the two
 * must compute identically so a preview always matches what closing would actually record.
 */
export async function previewReading(branchId: number, terminalId: string, branch: Branch): Promise<ReadingPreview> {
  const last = await getLastZReading(branchId, terminalId);
  const periodStart = last?.period_end ?? "1970-01-01 00:00:00";
  const periodEnd = new Date().toISOString().slice(0, 19).replace("T", " ");

  // orders.branch_id is currently never populated on insert (this app runs a single branch,
  // id 1) -- match NULL too so existing/future orders are still picked up. See invoice.ts.
  const orders = await select<Order>(
    "SELECT * FROM orders WHERE (branch_id = ? OR branch_id IS NULL) AND invoice_number IS NOT NULL AND created_at > ? AND created_at <= ?",
    [branchId, periodStart, periodEnd],
  );

  let grossSales = 0;
  let vatableSales = 0;
  let vatAmount = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let scPwdDiscountTotal = 0;
  let otherDiscountTotal = 0;
  for (const order of orders) {
    const breakdown = computeVatBreakdown(order, branch);
    grossSales += breakdown.totalDue;
    vatableSales += breakdown.vatableSales;
    vatAmount += breakdown.vatAmount;
    vatExemptSales += breakdown.vatExemptSales;
    zeroRatedSales += breakdown.zeroRatedSales;
    scPwdDiscountTotal += order.sc_pwd_discount_amount;
    otherDiscountTotal += order.discount_total - order.sc_pwd_discount_amount;
  }

  let cashSales = 0;
  let cashlessSales = 0;
  if (orders.length > 0) {
    const placeholders = orders.map(() => "?").join(",");
    const rows = await select<{ method: string; total: number }>(
      `SELECT method, SUM(amount) AS total FROM payments WHERE order_id IN (${placeholders}) GROUP BY method`,
      orders.map((o) => o.id),
    );
    for (const row of rows) {
      if (row.method === "cash") cashSales += row.total;
      else cashlessSales += row.total;
    }
  }

  const endingGrandTotal = await getGrandTotal(branchId);
  return {
    periodStart,
    periodEnd,
    beginningGrandTotal: last?.ending_grand_total ?? 0,
    endingGrandTotal,
    grossSales,
    vatableSales,
    vatAmount,
    vatExemptSales,
    zeroRatedSales,
    scPwdDiscountTotal,
    otherDiscountTotal,
    cashSales,
    cashlessSales,
    transactionCount: orders.length,
  };
}

/** Closes the current period: writes an immutable z_readings row (see migration
 * 0041_z_readings.sql -- the table rejects UPDATE/DELETE outright). Irreversible by design. */
export async function generateZReading(
  branchId: number,
  terminalId: string,
  branch: Branch,
  generatedBy: number | null,
): Promise<ZReading> {
  const preview = await previewReading(branchId, terminalId, branch);
  const last = await getLastZReading(branchId, terminalId);
  const sequenceNo = (last?.sequence_no ?? 0) + 1;

  const result = await execute(
    `INSERT INTO z_readings (
       branch_id, terminal_id, sequence_no, period_start, period_end,
       beginning_grand_total, ending_grand_total, gross_sales, vatable_sales, vat_amount,
       vat_exempt_sales, zero_rated_sales, sc_pwd_discount_total, other_discount_total,
       cash_sales, cashless_sales, transaction_count, generated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      branchId,
      terminalId,
      sequenceNo,
      preview.periodStart,
      preview.periodEnd,
      preview.beginningGrandTotal,
      preview.endingGrandTotal,
      preview.grossSales,
      preview.vatableSales,
      preview.vatAmount,
      preview.vatExemptSales,
      preview.zeroRatedSales,
      preview.scPwdDiscountTotal,
      preview.otherDiscountTotal,
      preview.cashSales,
      preview.cashlessSales,
      preview.transactionCount,
      generatedBy,
    ],
  );
  const [row] = await select<ZReading>("SELECT * FROM z_readings WHERE id = ?", [Number(result.lastInsertId)]);
  return row;
}
