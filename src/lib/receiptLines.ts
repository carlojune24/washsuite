import type { OrderItem, ServicePackage } from "../types";

export interface ReceiptLine {
  description: string;
  quantity: number;
  amount: number;
}

/**
 * Builds what a receipt/invoice should actually show as line items. A package order's own
 * included services/items are snapshotted into `order_items` at ₱0 each (the package price
 * already covers them) purely so the on-screen order detail can list "what's included" — on a
 * customer-facing receipt that just reads as a pile of ₱0 stock items with no indication of what
 * was actually sold. Here the package itself becomes the line instead, and only real extras
 * added on top of the package (non-zero priced order_items) still show individually.
 */
export function buildReceiptLines(items: OrderItem[], pkg: ServicePackage | null): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  if (pkg) {
    lines.push({ description: `${pkg.name} (package)`, quantity: 1, amount: pkg.price });
  }
  for (const it of items) {
    if (pkg && it.unit_price === 0 && it.line_total === 0) continue;
    lines.push({ description: it.description, quantity: it.quantity, amount: it.line_total });
  }
  return lines;
}
