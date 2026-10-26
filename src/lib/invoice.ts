import { select, execute } from "./db";
import { getActiveOrSeries } from "./orSeries";
import { incrementGrandTotal } from "./grandTotal";

/** Zero-pads to at least 5 digits, e.g. 1 -> "00001", matching the BIR OR-series format. */
export function formatInvoiceNumber(n: number): string {
  return String(n).padStart(5, "0");
}

/**
 * Returns the order's official-receipt number, assigning the next one from the currently
 * active OR series (see src/lib/orSeries.ts) the first time an invoice is generated for it —
 * reprinting/re-downloading later always returns this same number instead of drawing a new one.
 */
export async function getOrAssignInvoiceNumber(orderId: number): Promise<number> {
  const [order] = await select<{ invoice_number: number | null; branch_id: number | null; grand_total: number }>(
    "SELECT invoice_number, branch_id, grand_total FROM orders WHERE id = ?",
    [orderId],
  );
  if (order?.invoice_number) return order.invoice_number;

  const series = await getActiveOrSeries();
  if (!series || series.next_number > series.series_end) {
    throw new Error("No active OR series. Register a new one in Settings → OR Series.");
  }

  const next = series.next_number;
  const nowClosed = next + 1 > series.series_end;
  await execute(`UPDATE or_series SET next_number = ?${nowClosed ? ", status = 'closed'" : ""} WHERE id = ?`, [
    next + 1,
    series.id,
  ]);
  await execute("UPDATE orders SET invoice_number = ?, or_series_id = ? WHERE id = ?", [next, series.id, orderId]);
  // orders.branch_id is currently never set on insert (this app runs a single branch, id 1,
  // same assumption or_series.ts makes) -- fall back to it so the grand total still accrues.
  await incrementGrandTotal(order?.branch_id ?? 1, order?.grand_total ?? 0);
  return next;
}
