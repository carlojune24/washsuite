import { select, execute } from "./db";

/** Zero-pads to at least 5 digits, e.g. 1 -> "00001", matching the BIR OR-series format. */
export function formatInvoiceNumber(n: number): string {
  return String(n).padStart(5, "0");
}

/**
 * Returns the order's official-receipt number, assigning the next one from the branch's
 * sequence the first time an invoice is generated for it — reprinting/re-downloading later
 * always returns this same number instead of drawing a new one.
 */
export async function getOrAssignInvoiceNumber(orderId: number): Promise<number> {
  const [order] = await select<{ invoice_number: number | null }>(
    "SELECT invoice_number FROM orders WHERE id = ?",
    [orderId],
  );
  if (order?.invoice_number) return order.invoice_number;

  const [branch] = await select<{ next_invoice_number: number | null; or_series_start: number | null }>(
    "SELECT next_invoice_number, or_series_start FROM branches WHERE id = 1",
  );
  const next = branch?.next_invoice_number ?? branch?.or_series_start ?? 1;

  await execute("UPDATE branches SET next_invoice_number = ? WHERE id = 1", [next + 1]);
  await execute("UPDATE orders SET invoice_number = ? WHERE id = ?", [next, orderId]);
  return next;
}
