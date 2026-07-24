import {
  print_thermal_printer,
  list_thermal_printers,
  ENCODE,
  type PrintJobRequest,
  type PaperSize,
} from "tauri-plugin-thermal-printer";
import type { Order, OrderItem, Customer, Branch, ServicePackage } from "../types";
import { formatDateTime } from "./db";
import { formatInvoiceNumber } from "./invoice";
import { buildReceiptLines } from "./receiptLines";

/**
 * Thin wrapper around tauri-plugin-thermal-printer, tuned for a Bluetooth
 * ESC/POS receipt printer paired in Android settings.
 *
 * On Android the `printer` field must be the paired printer's Bluetooth MAC
 * address (e.g. "AA:BB:CC:DD:EE:FF"), not a friendly name. Store the chosen
 * printer's identifier in app settings (see settings table / local storage)
 * once the user pairs it from the Printer Settings screen.
 */

export const DEFAULT_PAPER_SIZE: PaperSize = "Mm58"; // common handheld BT receipt printer

const PAPER_SIZE_STORAGE_KEY = "washsuite-paper-size";
const KNOWN_PAPER_SIZES: PaperSize[] = ["Mm40", "Mm44", "Mm58", "Mm72", "Mm80", "Mm104"];

/** Item/Qty/Amt column widths (chars) per roll width -- the plugin requires these to sum
 * exactly to the paper's chars/line (see Printer Settings screen for the picker). */
const RECEIPT_COLUMN_WIDTHS: Record<PaperSize, [number, number, number]> = {
  Mm40: [10, 4, 7],
  Mm44: [12, 4, 8],
  Mm58: [16, 8, 8],
  Mm72: [24, 8, 10],
  Mm80: [28, 8, 12],
  Mm104: [38, 10, 14],
};

/** Device-local roll width preference -- device-local because the paired printer itself is
 * device-local, there's no single "branch" printer to hang this off of. */
export function getStoredPaperSize(): PaperSize {
  const stored = localStorage.getItem(PAPER_SIZE_STORAGE_KEY);
  return (KNOWN_PAPER_SIZES as string[]).includes(stored ?? "") ? (stored as PaperSize) : DEFAULT_PAPER_SIZE;
}

export function setStoredPaperSize(size: PaperSize): void {
  localStorage.setItem(PAPER_SIZE_STORAGE_KEY, size);
}

export async function listPairedPrinters() {
  return list_thermal_printers();
}

export interface ReceiptData {
  businessName: string;
  branchName?: string;
  order: Order;
  items: OrderItem[];
  customer?: Customer | null;
  pkg?: ServicePackage | null;
}

export async function printReceipt(printerIdentifier: string, data: ReceiptData) {
  const { businessName, branchName, order, items, customer, pkg } = data;
  const lines = buildReceiptLines(items, pkg ?? null);
  const paperSize = getStoredPaperSize();
  const [itemWidth, qtyWidth, amtWidth] = RECEIPT_COLUMN_WIDTHS[paperSize];

  const job: PrintJobRequest = {
    printer: printerIdentifier,
    paper_size: paperSize,
    options: {
      code_page: 6,
      encode: ENCODE.WINDOWS_1252,
      use_gbk: false,
    },
    sections: [
      { Title: { text: businessName } },
      ...(branchName ? [{ Subtitle: { text: branchName } }] : []),
      { Line: { character: "-" } },
      { Text: { text: `Order #: ${order.order_number}`, styles: defaultStyle() } },
      { Text: { text: `Date: ${formatDateTime(order.drop_off_at)}`, styles: defaultStyle() } },
      {
        Text: {
          text: `Customer: ${customer?.full_name ?? "Walk-in"}`,
          styles: defaultStyle(),
        },
      },
      { Line: { character: "-" } },
      {
        Table: {
          columns: 3,
          column_widths: [itemWidth, qtyWidth, amtWidth],
          header: [{ text: "Item" }, { text: "Qty" }, { text: "Amt" }],
          body: lines.map((it) => [
            { text: it.description },
            { text: String(it.quantity) },
            { text: it.amount.toFixed(2) },
          ]),
          truncate: true,
        },
      },
      { Line: { character: "-" } },
      { Text: { text: `Subtotal: ${order.subtotal.toFixed(2)}`, styles: rightStyle() } },
      { Text: { text: `Discount: ${order.discount_total.toFixed(2)}`, styles: rightStyle() } },
      {
        Text: {
          text: `TOTAL: ${order.grand_total.toFixed(2)}`,
          styles: { ...rightStyle(), bold: true, size: "double" },
        },
      },
      { Text: { text: `Paid: ${order.amount_paid.toFixed(2)}`, styles: rightStyle() } },
      { Feed: { feed_type: "lines", value: 2 } },
      { Text: { text: "Thank you for your business!", styles: centerStyle() } },
      { Feed: { feed_type: "lines", value: 3 } },
      { Cut: { mode: "full", feed: 3 } },
    ],
  } as PrintJobRequest;

  await print_thermal_printer(job);
}

export interface InvoiceReceiptData {
  branch: Branch;
  order: Order;
  items: OrderItem[];
  customer?: Customer | null;
  pkg?: ServicePackage | null;
  invoiceNumber: number;
  paymentMethodLabel?: string | null;
  referenceNo?: string | null;
}

/** Condensed BIR-style sales invoice for the same thermal printer (roll width from
 * Printer Settings) — see src/lib/invoiceReport.ts for the full-page PDF version of this
 * same layout. */
export async function printInvoice(printerIdentifier: string, data: InvoiceReceiptData) {
  const { branch, order, items, customer, pkg, invoiceNumber, paymentMethodLabel, referenceNo } = data;
  const lines = buildReceiptLines(items, pkg ?? null);
  const paperSize = getStoredPaperSize();
  const [itemWidth, qtyWidth, amtWidth] = RECEIPT_COLUMN_WIDTHS[paperSize];

  const grossTotal = order.grand_total;
  const vatAmount = branch.vat_registered ? grossTotal - grossTotal / 1.12 : 0;
  const saleAmount = grossTotal - vatAmount;
  const orSeriesLabel =
    branch.or_series_start && branch.or_series_end
      ? `${formatInvoiceNumber(branch.or_series_start)}-${formatInvoiceNumber(branch.or_series_end)}`
      : null;

  const job: PrintJobRequest = {
    printer: printerIdentifier,
    paper_size: paperSize,
    options: {
      code_page: 6,
      encode: ENCODE.WINDOWS_1252,
      use_gbk: false,
    },
    sections: [
      { Title: { text: branch.name.toUpperCase() } },
      ...(branch.address ? [{ Subtitle: { text: branch.address } }] : []),
      ...(branch.tin ? [{ Text: { text: `TIN: ${branch.tin}`, styles: centerStyle() } }] : []),
      { Line: { character: "-" } },
      { Text: { text: "SALES INVOICE", styles: { ...centerStyle(), bold: true } } },
      { Line: { character: "-" } },
      { Text: { text: `Invoice No.: ${formatInvoiceNumber(invoiceNumber)}`, styles: defaultStyle() } },
      { Text: { text: `Date: ${formatDateTime(order.drop_off_at)}`, styles: defaultStyle() } },
      { Text: { text: `Sold To: ${customer?.full_name ?? "Walk-in"}`, styles: defaultStyle() } },
      { Text: { text: `TIN: ${customer?.tin ?? "-"}`, styles: defaultStyle() } },
      { Line: { character: "-" } },
      {
        Table: {
          columns: 3,
          column_widths: [itemWidth, qtyWidth, amtWidth],
          header: [{ text: "Item" }, { text: "Qty" }, { text: "Amt" }],
          body: lines.map((it) => [
            { text: it.description },
            { text: String(it.quantity) },
            { text: it.amount.toFixed(2) },
          ]),
          truncate: true,
        },
      },
      { Line: { character: "-" } },
      {
        Text: {
          text: `${branch.vat_registered ? "Sale (VATable)" : "Sale (VAT-exempt/Non-VAT)"}: ${saleAmount.toFixed(2)}`,
          styles: rightStyle(),
        },
      },
      { Text: { text: `VAT (12%): ${vatAmount.toFixed(2)}`, styles: rightStyle() } },
      { Text: { text: `Discount: ${order.discount_total.toFixed(2)}`, styles: rightStyle() } },
      {
        Text: {
          text: `TOTAL DUE: ${grossTotal.toFixed(2)}`,
          styles: { ...rightStyle(), bold: true, size: "double" },
        },
      },
      { Line: { character: "-" } },
      { Text: { text: `Payment Method: ${paymentMethodLabel ?? "-"}`, styles: defaultStyle() } },
      { Text: { text: `Reference No.: ${referenceNo ?? "-"}`, styles: defaultStyle() } },
      { Text: { text: `Terms: ${branch.invoice_terms ?? "Due upon receipt"}`, styles: defaultStyle() } },
      { Feed: { feed_type: "lines", value: 2 } },
      { Text: { text: "Authorized Signature", styles: centerStyle() } },
      { Feed: { feed_type: "lines", value: 1 } },
      {
        Text: {
          text: branch.vat_registered
            ? "This document is valid for claiming input tax if issued by a VAT-registered entity."
            : "This document serves as proof of sale. Non-VAT registered. Not valid for claiming input tax.",
          styles: centerStyle(),
        },
      },
      ...(branch.bir_permit_no
        ? [{ Text: { text: `BIR Permit No. ${branch.bir_permit_no}`, styles: centerStyle() } }]
        : []),
      ...(orSeriesLabel ? [{ Text: { text: `Series: ${orSeriesLabel}`, styles: centerStyle() } }] : []),
      { Feed: { feed_type: "lines", value: 1 } },
      { Text: { text: "Thank you for your business!", styles: centerStyle() } },
      { Feed: { feed_type: "lines", value: 3 } },
      { Cut: { mode: "full", feed: 3 } },
    ],
  } as PrintJobRequest;

  await print_thermal_printer(job);
}

function defaultStyle() {
  return {
    bold: false,
    underline: false,
    align: "left" as const,
    italic: false,
    invert: false,
    font: "A" as const,
    rotate: false,
    upside_down: false,
    size: "normal" as const,
  };
}

function rightStyle() {
  return { ...defaultStyle(), align: "right" as const };
}

function centerStyle() {
  return { ...defaultStyle(), align: "center" as const };
}
