import { select, execute } from "./db";

/** Current lifetime accumulated sales total for a branch (see grand_total_counter table). */
export async function getGrandTotal(branchId: number): Promise<number> {
  const [row] = await select<{ running_total: number }>(
    "SELECT running_total FROM grand_total_counter WHERE branch_id = ?",
    [branchId],
  );
  return row?.running_total ?? 0;
}

/**
 * Adds to the branch's lifetime running total. A DB trigger (see migration
 * 0040_grand_total_counter.sql) rejects any update that would decrease it, so this is the
 * only legitimate way the counter ever changes -- called once per order, the moment it
 * becomes an officially numbered invoice (see getOrAssignInvoiceNumber in invoice.ts).
 */
export async function incrementGrandTotal(branchId: number, amount: number): Promise<void> {
  await execute(
    "UPDATE grand_total_counter SET running_total = running_total + ?, updated_at = datetime('now') WHERE branch_id = ?",
    [amount, branchId],
  );
}
