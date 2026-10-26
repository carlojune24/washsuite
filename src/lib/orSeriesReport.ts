import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatInvoiceNumber } from "./invoice";
import { formatDateTime } from "./db";
import type { OrSeries } from "../types";
import type { LiquidationRow } from "./orSeries";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const RED_600: [number, number, number] = [220, 38, 38];

export interface OrSeriesLiquidationReportOptions {
  businessName: string;
  series: OrSeries;
  rows: LiquidationRow[];
  totals: { issued: number; voided: number; unused: number };
}

export function buildOrSeriesLiquidationDoc(opts: OrSeriesLiquidationReportOptions): jsPDF {
  const { series, rows, totals } = opts;
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
  doc.text("OR Series Liquidation Report", margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });

  let y = 84;
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Series ${formatInvoiceNumber(series.series_start)}–${formatInvoiceNumber(series.series_end)}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  const metaLine = [
    series.status === "active" ? "Active" : "Closed",
    `Registered ${series.registered_at}`,
    series.permit_no ? `Permit ${series.permit_no}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
  doc.text(metaLine, margin, y + 14);

  y += 34;

  // ---- Summary cards ----
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: "Issued", value: String(totals.issued), color: EMERALD_600 },
    { label: "Voided", value: String(totals.voided), color: RED_600 },
    { label: "Unused", value: String(totals.unused), color: SLATE_500 },
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
    doc.setFontSize(15);
    doc.text(c.value, x + 10, y + 36);
  });

  y += cardHeight + 20;

  // ---- Numbers table ----
  const body: (string | { content: string; styles?: Record<string, unknown> })[][] = rows.map((r) => {
    const number = formatInvoiceNumber(r.number);
    if (r.status === "issued" && r.order) {
      return [
        number,
        { content: "Issued", styles: { textColor: EMERALD_600, fontStyle: "bold" } },
        `${r.order.order_number} · ${r.order.customer_name ?? "Walk-in"}`,
        formatDateTime(r.order.drop_off_at),
      ];
    }
    if (r.status === "voided") {
      return [
        number,
        { content: "Voided", styles: { textColor: RED_600, fontStyle: "bold" } },
        r.voidReason || "—",
        r.voidedAt ? formatDateTime(r.voidedAt) : "—",
      ];
    }
    return [number, { content: "Unused", styles: { textColor: SLATE_500 } }, "—", "—"];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [["No.", "Status", "Order / Reason", "Date"]],
    body,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 70 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 110 },
    },
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

export function generateOrSeriesLiquidationPdf(opts: OrSeriesLiquidationReportOptions) {
  const doc = buildOrSeriesLiquidationDoc(opts);
  const { series } = opts;
  doc.save(`or-series-${formatInvoiceNumber(series.series_start)}-${formatInvoiceNumber(series.series_end)}-liquidation.pdf`);
}
