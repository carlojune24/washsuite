import { select, execute } from "./db";
import type { LoadTag } from "../types";

/**
 * Assigns (or returns already-assigned) load tags for every physical load on this order,
 * numbered against `tagDate`'s own daily sequence — starts at 1 for that business day's first
 * load and keeps counting up across every order that day, resetting on the next day. Reprinting
 * later always returns the same numbers instead of drawing new ones (mirrors
 * getOrAssignInvoiceNumber in invoice.ts).
 */
export async function getOrAssignLoadTags(orderId: number, loadCount: number, tagDate: string): Promise<LoadTag[]> {
  const existing = await select<LoadTag>("SELECT * FROM load_tags WHERE order_id = ? ORDER BY load_index", [
    orderId,
  ]);
  if (existing.length >= loadCount) return existing;

  const [row] = await select<{ max_number: number | null }>(
    "SELECT MAX(daily_number) as max_number FROM load_tags WHERE tag_date = ?",
    [tagDate],
  );
  let next = (row?.max_number ?? 0) + 1;

  const existingIndexes = new Set(existing.map((t) => t.load_index));
  for (let i = 1; i <= loadCount; i++) {
    if (existingIndexes.has(i)) continue;
    await execute("INSERT INTO load_tags (order_id, load_index, tag_date, daily_number) VALUES (?, ?, ?, ?)", [
      orderId,
      i,
      tagDate,
      next,
    ]);
    next++;
  }

  return select<LoadTag>("SELECT * FROM load_tags WHERE order_id = ? ORDER BY load_index", [orderId]);
}
