import { select, execute } from "./db";
import type { OrSeries, OrSeriesVoid } from "../types";

export async function listOrSeries(): Promise<OrSeries[]> {
  return select<OrSeries>("SELECT * FROM or_series WHERE branch_id = 1 ORDER BY id DESC");
}

export async function getActiveOrSeries(): Promise<OrSeries | null> {
  const [row] = await select<OrSeries>(
    "SELECT * FROM or_series WHERE branch_id = 1 AND status = 'active' ORDER BY id DESC LIMIT 1",
  );
  return row ?? null;
}

export async function getOrSeriesById(id: number): Promise<OrSeries | null> {
  const [row] = await select<OrSeries>("SELECT * FROM or_series WHERE id = ?", [id]);
  return row ?? null;
}

export interface RegisterOrSeriesInput {
  seriesStart: number;
  seriesEnd: number;
  permitNo?: string | null;
  registeredAt: string;
  notes?: string | null;
}

/**
 * Registers a new booklet/series once one from BIR is in hand. Only one series may be active
 * (i.e. still being drawn from) at a time -- close the current one first if it still has unused
 * numbers, so numbering never silently jumps between two "active" ranges.
 */
export async function registerOrSeries(input: RegisterOrSeriesInput): Promise<number> {
  const { seriesStart, seriesEnd, permitNo, registeredAt, notes } = input;
  if (seriesStart > seriesEnd) {
    throw new Error("Series start must not be after series end.");
  }

  const active = await getActiveOrSeries();
  if (active) {
    throw new Error(
      `Series ${active.series_start}-${active.series_end} is still active. Close it before registering a new one.`,
    );
  }

  const overlapping = await select<{ id: number }>(
    "SELECT id FROM or_series WHERE branch_id = 1 AND series_start <= ? AND series_end >= ?",
    [seriesEnd, seriesStart],
  );
  if (overlapping.length > 0) {
    throw new Error("This range overlaps an already-registered series.");
  }

  const result = await execute(
    `INSERT INTO or_series (branch_id, series_start, series_end, next_number, permit_no, registered_at, notes)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    [seriesStart, seriesEnd, seriesStart, permitNo || null, registeredAt, notes || null],
  );
  return Number(result.lastInsertId);
}

/** Manually closes an active series early -- e.g. the booklet was lost or retired with sheets still unused. */
export async function closeOrSeries(id: number): Promise<void> {
  await execute("UPDATE or_series SET status = 'closed' WHERE id = ?", [id]);
}

/**
 * Spoils the series' current next number (never assigned to an order) and advances past it,
 * closing the series if that was its last number. Mirrors physically writing "VOID" on a
 * damaged receipt and moving to the next one in the book.
 */
export async function voidNextOrNumber(seriesId: number, reason: string | null, voidedBy: number | null): Promise<void> {
  const series = await getOrSeriesById(seriesId);
  if (!series) throw new Error("Series not found.");
  if (series.status !== "active") throw new Error("Series is not active.");
  if (series.next_number > series.series_end) throw new Error("Series is fully consumed.");

  const voidedNumber = series.next_number;
  const newNext = voidedNumber + 1;
  const nowClosed = newNext > series.series_end;

  await execute("INSERT INTO or_series_voids (or_series_id, or_number, reason, voided_by) VALUES (?, ?, ?, ?)", [
    seriesId,
    voidedNumber,
    reason || null,
    voidedBy,
  ]);
  await execute(`UPDATE or_series SET next_number = ?${nowClosed ? ", status = 'closed'" : ""} WHERE id = ?`, [
    newNext,
    seriesId,
  ]);
}

export interface LiquidationRow {
  number: number;
  status: "issued" | "voided" | "unused";
  order?: { id: number; order_number: string; drop_off_at: string; customer_name: string | null };
  voidReason?: string | null;
  voidedAt?: string;
}

export interface OrSeriesLiquidation {
  series: OrSeries;
  rows: LiquidationRow[];
  totals: { issued: number; voided: number; unused: number };
}

/** Every number in a series' range, tagged issued (linked to the order it went to), voided, or unused. */
export async function getOrSeriesLiquidation(seriesId: number): Promise<OrSeriesLiquidation> {
  const series = await getOrSeriesById(seriesId);
  if (!series) throw new Error("Series not found.");

  const issuedOrders = await select<{
    id: number;
    order_number: string;
    drop_off_at: string;
    customer_name: string | null;
    invoice_number: number;
  }>(
    `SELECT o.id, o.order_number, o.drop_off_at, o.invoice_number, c.full_name AS customer_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.or_series_id = ?
     ORDER BY o.invoice_number`,
    [seriesId],
  );
  const voids = await select<OrSeriesVoid>("SELECT * FROM or_series_voids WHERE or_series_id = ?", [seriesId]);

  const issuedByNumber = new Map(issuedOrders.map((o) => [o.invoice_number, o]));
  const voidByNumber = new Map(voids.map((v) => [v.or_number, v]));

  const rows: LiquidationRow[] = [];
  let issued = 0;
  let voided = 0;
  let unused = 0;
  for (let n = series.series_start; n <= series.series_end; n++) {
    const order = issuedByNumber.get(n);
    const voidRow = voidByNumber.get(n);
    if (order) {
      issued++;
      rows.push({
        number: n,
        status: "issued",
        order: { id: order.id, order_number: order.order_number, drop_off_at: order.drop_off_at, customer_name: order.customer_name },
      });
    } else if (voidRow) {
      voided++;
      rows.push({ number: n, status: "voided", voidReason: voidRow.reason, voidedAt: voidRow.voided_at });
    } else {
      unused++;
      rows.push({ number: n, status: "unused" });
    }
  }

  return { series, rows, totals: { issued, voided, unused } };
}

/**
 * The series a specific order's invoice number was actually drawn from -- used at print time so
 * a reprinted invoice always shows the range/permit it was issued under, even after a newer
 * series has since been registered.
 */
export async function getOrderInvoiceSeries(
  orderId: number,
): Promise<{ seriesStart: number; seriesEnd: number; permitNo: string | null } | null> {
  const [row] = await select<{ series_start: number; series_end: number; permit_no: string | null }>(
    `SELECT s.series_start, s.series_end, s.permit_no
     FROM orders o
     JOIN or_series s ON s.id = o.or_series_id
     WHERE o.id = ?`,
    [orderId],
  );
  if (!row) return null;
  return { seriesStart: row.series_start, seriesEnd: row.series_end, permitNo: row.permit_no };
}
