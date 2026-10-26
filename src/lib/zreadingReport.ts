import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateTime } from "./db";
import type { Branch, ZReading } from "../types";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];

// jsPDF's built-in fonts (Helvetica etc.) don't have a glyph for the actual peso sign (₱,
// U+20B1) and render it as garbage (a stray +/- glyph) -- same reason salesReport.ts and
// invoiceReport.ts use a plain "P" instead. The React UI elsewhere can use "₱" fine since
// that's normal browser text rendering, not a PDF font.
function peso(n: number): string {
  return `P${n.toFixed(2)}`;
}

export interface ZReadingReportOptions {
  businessName: string;
  branch: Branch;
  reading: ZReading;
}

export function buildZReadingDoc(opts: ZReadingReportOptions): jsPDF {
  const { branch, reading } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  // ---- Header band ----
  doc.setFillColor(...BRAND_900);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.businessName, margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Z-Reading — Terminal ${reading.terminal_id}`, margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });

  let y = 84;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  const businessLine = [branch.address, branch.phone].filter(Boolean).join("   ·   ");
  if (businessLine) {
    doc.text(businessLine, margin, y);
    y += 13;
  }
  const idLine = [
    branch.tin ? `TIN ${branch.tin}` : null,
    branch.bir_permit_no ? `BIR Permit No. ${branch.bir_permit_no}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (idLine) {
    doc.text(idLine, margin, y);
    y += 13;
  }

  y += 8;
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Z-Counter No. ${reading.sequence_no}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(`Period ${formatDateTime(reading.period_start)} – ${formatDateTime(reading.period_end)}`, margin, y + 14);

  y += 34;

  // ---- Summary cards ----
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: "Gross Sales", value: peso(reading.gross_sales), color: EMERALD_600 },
    { label: "VAT Amount", value: peso(reading.vat_amount), color: BRAND_900 },
    { label: "Discounts", value: peso(reading.sc_pwd_discount_total + reading.other_discount_total), color: SLATE_500 },
    { label: "Transactions", value: String(reading.transaction_count), color: SLATE_500 },
  ];
  const cardGap = 12;
  const cardWidth = (usableWidth - cardGap * (cards.length - 1)) / cards.length;
  const cardHeight = 48;
  cards.forEach((c, i) => {
    const x = margin + i * (cardWidth + cardGap);
    doc.setFillColor(...SLATE_100);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, "F");
    doc.setDrawColor(...c.color);
    doc.setLineWidth(2.5);
    doc.line(x, y + 2, x, y + cardHeight - 2);
    doc.setTextColor(...SLATE_500);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(c.label, x + 10, y + 18);
    doc.setTextColor(...BRAND_900);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(c.value, x + 10, y + 36);
  });

  y += cardHeight + 20;

  // ---- Breakdown table ----
  const rows: [string, string][] = [
    ["Beginning Grand Total", peso(reading.beginning_grand_total)],
    ["Ending Grand Total", peso(reading.ending_grand_total)],
    ["Vatable Sales", peso(reading.vatable_sales)],
    ["VAT Amount (12%)", peso(reading.vat_amount)],
    ["VAT-Exempt Sales", peso(reading.vat_exempt_sales)],
    ["Zero-Rated Sales", peso(reading.zero_rated_sales)],
    ["SC/PWD Discount", peso(reading.sc_pwd_discount_total)],
    ["Other Discounts", peso(reading.other_discount_total)],
    ["Cash Sales", peso(reading.cash_sales)],
    ["Cashless Sales", peso(reading.cashless_sales)],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [["Field", "Amount"]],
    body: rows,
    theme: "striped",
    styles: { fontSize: 9.5, cellPadding: 6 },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 140, halign: "right" } },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_500);
      doc.text(`Page ${current} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 16, {
        align: "right",
      });
    },
  });

  return doc;
}

export function generateZReadingPdf(opts: ZReadingReportOptions) {
  const doc = buildZReadingDoc(opts);
  doc.save(`z-reading-${opts.reading.terminal_id}-${String(opts.reading.sequence_no).padStart(5, "0")}.pdf`);
}
