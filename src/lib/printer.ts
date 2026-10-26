import {
  print_thermal_printer,
  list_thermal_printers,
  ENCODE,
  type PrintJobRequest,
  type PaperSize,
  type PrinterInfo,
} from "tauri-plugin-thermal-printer";
import type { Order, OrderItem, Customer, Branch, ServicePackage, LoadTag } from "../types";
import { formatDateTime } from "./db";
import { formatInvoiceNumber } from "./invoice";
import { buildReceiptLines } from "./receiptLines";
import { computeVatBreakdown } from "./vat";

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

const PRINTER_ID_STORAGE_KEY = "washsuite-printer-id";

/** Device-local selected printer -- device-local for the same reason as the roll width. */
export function getStoredPrinterId(): string | null {
  return localStorage.getItem(PRINTER_ID_STORAGE_KEY);
}

export function setStoredPrinterId(identifier: string): void {
  localStorage.setItem(PRINTER_ID_STORAGE_KEY, identifier);
}

/**
 * Picks the printer to print to: the stored selection if it's still paired, the sole paired
 * printer if there's only one and nothing's stored yet, otherwise `undefined` -- forcing an
 * explicit choice in Printer Settings when multiple printers are paired.
 */
export function resolveSelectedPrinter(printers: PrinterInfo[] | null | undefined): PrinterInfo | undefined {
  if (!printers || printers.length === 0) return undefined;
  const storedId = getStoredPrinterId();
  const stored = storedId ? printers.find((p) => p.identifier === storedId) : undefined;
  if (stored) return stored;
  return printers.length === 1 ? printers[0] : undefined;
}

const MAC_ADDRESS_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;

/**
 * Resolves the string the plugin's native print calls need for `printer`.
 *
 * On Android, `identifier` is the paired device's Bluetooth MAC address, which is exactly
 * what the native side expects. On Windows desktop, `identifier` is the OS port name (e.g.
 * "USB001") returned by EnumPrinters, but the desktop print path opens the printer by its
 * registered name via OpenPrinterW -- passing the port name there fails with "The printer
 * name is invalid." Use the MAC-address shape to tell the two cases apart without adding a
 * platform-detection dependency.
 */
export function resolvePrinterTarget(printer: PrinterInfo): string {
  return MAC_ADDRESS_RE.test(printer.identifier) ? printer.identifier : printer.name;
}

export interface ReceiptData {
  businessName: string;
  branchName?: string;
  order: Order;
  items: OrderItem[];
  customer?: Customer | null;
  pkg?: ServicePackage | null;
}

export async function printReceipt(printerInfo: PrinterInfo, data: ReceiptData) {
  const { businessName, branchName, order, items, customer, pkg } = data;
  const lines = buildReceiptLines(items, pkg ?? null, order.package_loads);
  const paperSize = getStoredPaperSize();
  const [itemWidth, qtyWidth, amtWidth] = RECEIPT_COLUMN_WIDTHS[paperSize];

  const job: PrintJobRequest = {
    printer: resolvePrinterTarget(printerInfo),
    paper_size: paperSize,
    options: {
      code_page: 6,
      encode: ENCODE.WINDOWS_1252,
      use_gbk: false,
    },
    sections: [
      { Title: { text: businessName } },
      ...(branchName ? [{ Text: { text: branchName, styles: centerStyle() } }] : []),
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
  /** The specific OR series range this invoice number was drawn from -- see getOrderInvoiceSeries
   * in src/lib/orSeries.ts. Pass null only when the order predates OR series tracking. */
  orSeriesLabel: string | null;
  /** The permit number for that same series (falls back to the branch's default permit if the
   * series didn't register its own). */
  birPermitNo: string | null;
  paymentMethodLabel?: string | null;
  referenceNo?: string | null;
}

/** Condensed BIR-style sales invoice for the same thermal printer (roll width from
 * Printer Settings) — see src/lib/invoiceReport.ts for the full-page PDF version of this
 * same layout. */
export async function printInvoice(printerInfo: PrinterInfo, data: InvoiceReceiptData) {
  const { branch, order, items, customer, pkg, invoiceNumber, orSeriesLabel, birPermitNo, paymentMethodLabel, referenceNo } =
    data;
  const lines = buildReceiptLines(items, pkg ?? null, order.package_loads);
  const paperSize = getStoredPaperSize();
  const [itemWidth, qtyWidth, amtWidth] = RECEIPT_COLUMN_WIDTHS[paperSize];

  const vat = computeVatBreakdown(order, branch);

  const job: PrintJobRequest = {
    printer: resolvePrinterTarget(printerInfo),
    paper_size: paperSize,
    options: {
      code_page: 6,
      encode: ENCODE.WINDOWS_1252,
      use_gbk: false,
    },
    sections: [
      { Title: { text: branch.name.toUpperCase() } },
      ...(branch.address ? [{ Text: { text: branch.address, styles: centerStyle() } }] : []),
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
          text: `${vat.label}: ${(vat.vatableSales + vat.vatExemptSales + vat.zeroRatedSales).toFixed(2)}`,
          styles: rightStyle(),
        },
      },
      { Text: { text: `VAT (12%): ${vat.vatAmount.toFixed(2)}`, styles: rightStyle() } },
      ...(order.sc_pwd_discount_amount > 0
        ? [{ Text: { text: `SC/PWD Discount: ${order.sc_pwd_discount_amount.toFixed(2)}`, styles: rightStyle() } }]
        : [{ Text: { text: `Discount: ${vat.discountAmount.toFixed(2)}`, styles: rightStyle() } }]),
      {
        Text: {
          text: `TOTAL DUE: ${vat.totalDue.toFixed(2)}`,
          styles: { ...rightStyle(), bold: true, size: "double" },
        },
      },
      { Line: { character: "-" } },
      ...(order.sc_pwd_discount_amount > 0
        ? [
            {
              Text: {
                text: `SC/PWD ID: ${order.sc_pwd_id_no ?? "-"}  Name: ${order.sc_pwd_name ?? "-"}`,
                styles: defaultStyle(),
              },
            },
          ]
        : []),
      { Text: { text: `Payment Method: ${paymentMethodLabel ?? "-"}`, styles: defaultStyle() } },
      { Text: { text: `Reference No.: ${referenceNo ?? "-"}`, styles: defaultStyle() } },
      { Text: { text: `Terms: ${branch.invoice_terms ?? "Due upon receipt"}`, styles: defaultStyle() } },
      { Feed: { feed_type: "lines", value: 2 } },
      { Text: { text: "Authorized Signature", styles: centerStyle() } },
      { Feed: { feed_type: "lines", value: 1 } },
      {
        Text: {
          text:
            vat.vatStatus === "vatable"
              ? "This document is valid for claiming input tax if issued by a VAT-registered entity."
              : "This document serves as proof of sale. Non-VAT registered. Not valid for claiming input tax.",
          styles: centerStyle(),
        },
      },
      ...(birPermitNo ? [{ Text: { text: `BIR Permit No. ${birPermitNo}`, styles: centerStyle() } }] : []),
      ...(orSeriesLabel ? [{ Text: { text: `Series: ${orSeriesLabel}`, styles: centerStyle() } }] : []),
      { Feed: { feed_type: "lines", value: 1 } },
      { Text: { text: "Thank you for your business!", styles: centerStyle() } },
      { Feed: { feed_type: "lines", value: 3 } },
      { Cut: { mode: "full", feed: 3 } },
    ],
  } as PrintJobRequest;

  await print_thermal_printer(job);
}

export interface LoadTagData {
  businessName: string;
  order: Order;
  items: OrderItem[];
  customer?: Customer | null;
  pkg?: ServicePackage | null;
  tags: LoadTag[]; // one per physical load, already numbered by getOrAssignLoadTags
}

/**
 * Prints one small tag per physical load — meant to be cut apart and put into the machine with
 * that load. The daily sequence number is the whole point (that's what the owner tracks loads
 * by day-to-day), so it's the biggest thing on the tag; order/customer/contents are there so a
 * lost or mixed-up tag can still be traced back.
 */
export async function printLoadTags(printerInfo: PrinterInfo, data: LoadTagData) {
  const { businessName, order, items, customer, pkg, tags } = data;
  const lines = buildReceiptLines(items, pkg ?? null, order.package_loads);
  const paperSize = getStoredPaperSize();
  const target = resolvePrinterTarget(printerInfo);

  for (const tag of tags) {
    const job: PrintJobRequest = {
      printer: target,
      paper_size: paperSize,
      options: {
        code_page: 6,
        encode: ENCODE.WINDOWS_1252,
        use_gbk: false,
      },
      sections: [
        { Title: { text: businessName } },
        { Line: { character: "-" } },
        {
          Text: {
            text: `#${tag.daily_number}`,
            styles: { ...centerStyle(), bold: true, size: "double" },
          },
        },
        { Text: { text: `Load ${tag.load_index} of ${tags.length}`, styles: centerStyle() } },
        { Line: { character: "-" } },
        { Text: { text: `Order #: ${order.order_number}`, styles: defaultStyle() } },
        {
          Text: {
            text: `Customer: ${customer?.full_name ?? "Walk-in"}`,
            styles: defaultStyle(),
          },
        },
        ...lines.map((it) => ({
          Text: { text: `${it.description} x${it.quantity}`, styles: defaultStyle() },
        })),
        { Feed: { feed_type: "lines", value: 2 } },
        { Cut: { mode: "full", feed: 3 } },
      ],
    } as PrintJobRequest;

    await print_thermal_printer(job);
  }
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
