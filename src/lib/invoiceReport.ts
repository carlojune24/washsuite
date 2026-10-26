import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatInvoiceNumber } from "./invoice";
import type { VatBreakdown } from "./vat";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const AMBER_600: [number, number, number] = [217, 119, 6];

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  amount: number;
}

export interface InvoiceReportOptions {
  businessName: string;
  businessAddress: string | null;
  businessTin: string | null;
  businessContact: string | null;
  birPermitNo: string | null;
  orSeriesLabel: string | null;
  invoiceNumber: number;
  orderNumber: string;
  dateLabel: string;
  customerName: string;
  customerTin: string | null;
  customerAddress: string | null;
  items: InvoiceLineItem[];
  /** Precomputed via computeVatBreakdown(order, branch) in src/lib/vat.ts — the single source of
   * truth for the Sale/VAT/TOTAL DUE breakdown, including the (post-discount) `totalDue`, which is
   * `orders.grand_total`, not a sum of `items` (package orders zero out item lines). */
  vat: VatBreakdown;
  /** Set when the sale used the statutory SC/PWD discount, so the ID/name can be itemized. */
  scPwd: { idNo: string | null; name: string | null; discountAmount: number } | null;
  paymentMethodLabel: string | null;
  referenceNo: string | null;
  terms: string | null;
}

function peso(n: number) {
  return `P${n.toFixed(2)}`;
}

export function buildInvoiceDoc(opts: InvoiceReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const usableWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;

  let y = 56;

  // ---- Business header (centered, matches the reference sales-invoice layout) ----
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(opts.businessName.toUpperCase(), centerX, y, { align: "center" });
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  if (opts.businessAddress) {
    doc.text(opts.businessAddress, centerX, y, { align: "center" });
    y += 12;
  }
  const contactLine = [opts.businessContact, opts.businessTin ? `TIN: ${opts.businessTin}` : null]
    .filter(Boolean)
    .join("   ·   ");
  if (contactLine) {
    doc.text(contactLine, centerX, y, { align: "center" });
    y += 12;
  }

  y += 10;
  doc.setDrawColor(...SLATE_100);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  // ---- Title ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_900);
  doc.text("SALES INVOICE", centerX, y, { align: "center" });
  y += 26;

  // ---- Meta block: invoice no/date on the left, sold-to on the right ----
  doc.setFontSize(9.5);
  const metaLabelX = margin;
  const metaValueX = margin + 90;
  function metaRow(label: string, value: string) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SLATE_500);
    doc.text(label, metaLabelX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_900);
    doc.text(value, metaValueX, y);
    y += 15;
  }
  metaRow("Invoice No.", formatInvoiceNumber(opts.invoiceNumber));
  metaRow("Date", opts.dateLabel);
  metaRow("Sold To", opts.customerName);
  metaRow("TIN", opts.customerTin ?? "—");
  if (opts.customerAddress) metaRow("Address", opts.customerAddress);

  y += 8;

  // ---- Line items ----
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Description", "Qty", "Amount"]],
    body: opts.items.map((it) => [it.description, String(it.quantity), peso(it.amount)]),
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: SLATE_100, textColor: BRAND_900, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 60 }, 2: { halign: "right", cellWidth: 90 } },
    tableLineColor: SLATE_100,
    tableLineWidth: 0.5,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // ---- Totals ----
  const { vat, scPwd } = opts;
  const saleAmount = vat.vatableSales + vat.vatExemptSales + vat.zeroRatedSales;

  function totalRow(label: string, value: string, bold = false, color: [number, number, number] = SLATE_500) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...color);
    doc.text(label, pageWidth - margin - 160, y);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += bold ? 18 : 14;
  }
  totalRow(vat.label, peso(saleAmount));
  totalRow("VAT (12%)", peso(vat.vatAmount));
  if (scPwd && scPwd.discountAmount > 0) {
    totalRow("SC/PWD Discount", peso(scPwd.discountAmount));
  } else {
    totalRow("Discount", peso(vat.discountAmount));
  }
  doc.setDrawColor(...SLATE_100);
  doc.line(pageWidth - margin - 160, y - 4, pageWidth - margin, y - 4);
  y += 4;
  totalRow("TOTAL DUE", peso(vat.totalDue), true, BRAND_900);
  if (scPwd && scPwd.discountAmount > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_500);
    doc.text(`SC/PWD ID: ${scPwd.idNo ?? "—"}   Name: ${scPwd.name ?? "—"}`, pageWidth - margin, y, { align: "right" });
    y += 14;
  }

  y += 16;

  // ---- Payment / terms ----
  doc.setDrawColor(...SLATE_100);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;
  metaRowAt(doc, margin, y, "Payment Method", opts.paymentMethodLabel ?? "—");
  y += 15;
  metaRowAt(doc, margin, y, "Reference No.", opts.referenceNo ?? "—");
  y += 15;
  metaRowAt(doc, margin, y, "Terms", opts.terms ?? "Due upon receipt");
  y += 40;

  // ---- Signature line ----
  doc.setDrawColor(...SLATE_500);
  doc.line(centerX - 90, y, centerX + 90, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text("Authorized Signature", centerX, y, { align: "center" });

  y += 30;

  // ---- BIR disclaimer footer ----
  doc.setDrawColor(...AMBER_600);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  const disclaimer =
    vat.vatStatus === "vatable"
      ? "THIS DOCUMENT SHALL BE VALID FOR CLAIM OF INPUT TAX ONLY IF ISSUED BY A VAT-REGISTERED PERSON/ENTITY."
      : "THIS DOCUMENT SERVES AS PROOF OF SALE FOR SERVICES RENDERED. NON-VAT REGISTERED. THIS DOCUMENT IS NOT VALID FOR CLAIMING INPUT TAX.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, usableWidth);
  doc.text(disclaimerLines, centerX, y, { align: "center" });
  y += disclaimerLines.length * 10 + 4;

  const permitLine = [
    opts.birPermitNo ? `BIR Permit No. [${opts.birPermitNo}]` : null,
    opts.orSeriesLabel ? `Series: [${opts.orSeriesLabel}]` : null,
  ]
    .filter(Boolean)
    .join("   |   ");
  if (permitLine) {
    doc.setFont("helvetica", "normal");
    doc.text(permitLine, centerX, y, { align: "center" });
    y += 12;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Thank you for your business!", centerX, y, { align: "center" });

  return doc;
}

function metaRowAt(doc: jsPDF, x: number, y: number, label: string, value: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_500);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_900);
  doc.text(value, x + 90, y);
}

export function generateInvoicePdf(opts: InvoiceReportOptions) {
  const doc = buildInvoiceDoc(opts);
  doc.save(`invoice-${formatInvoiceNumber(opts.invoiceNumber)}.pdf`);
}
