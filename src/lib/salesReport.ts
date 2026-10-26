import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateTime } from "./db";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const BLUE_600: [number, number, number] = [37, 99, 235];
const RED_600: [number, number, number] = [220, 38, 38];

function peso(n: number) {
  return `P${n.toFixed(2)}`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Received",
  ready: "Ready",
  claimed: "Claimed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export interface SalesReportRow {
  order_number: string;
  drop_off_at: string;
  customer_name: string | null;
  item_label: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  grand_total: number;
}

export interface SalesReportOptions {
  businessName: string;
  branchName?: string | null;
  periodLabel: string;
  filterLabel: string;
  totalSum: number;
  totalCount: number;
  paidCount: number;
  paidSum: number;
  readyCount: number;
  readySum: number;
  unpaidCount: number;
  unpaidSum: number;
  totalLoads: number;
  totalKg: number;
  rows: SalesReportRow[];
}

export function buildSalesReportDoc(opts: SalesReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const usableWidth = pageWidth - margin * 2;

  // ---- Header band ----
  doc.setFillColor(...BRAND_900);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.businessName, margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Sales Report", margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });
  if (opts.branchName) {
    doc.text(opts.branchName, pageWidth - margin, 47, { align: "right" });
  }

  let y = 84;
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.periodLabel, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(opts.filterLabel, margin, y + 14);

  y += 34;

  // ---- Summary cards ----
  const cards: { label: string; value: string; sub?: string; color: [number, number, number] }[] = [
    { label: "Total Sales", value: peso(opts.totalSum), sub: `${opts.totalCount} order${opts.totalCount === 1 ? "" : "s"}`, color: BRAND_900 },
    { label: "Paid", value: String(opts.paidCount), sub: peso(opts.paidSum), color: EMERALD_600 },
    { label: "Ready", value: String(opts.readyCount), sub: peso(opts.readySum), color: BLUE_600 },
    { label: "Unpaid", value: String(opts.unpaidCount), sub: peso(opts.unpaidSum), color: RED_600 },
  ];
  const cardGap = 12;
  const cardWidth = (usableWidth - cardGap * (cards.length - 1)) / cards.length;
  const cardHeight = 54;
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
    doc.text(c.label, x + 10, y + 16);
    doc.setTextColor(...BRAND_900);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(c.value, x + 10, y + 34);
    if (c.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      doc.text(c.sub, x + 10, y + 46);
    }
  });

  y += cardHeight + 18;

  // ---- Loads line ----
  doc.setFillColor(...SLATE_100);
  doc.roundedRect(margin, y, usableWidth, 30, 4, 4, "F");
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const loadsText = `${opts.totalLoads} load${opts.totalLoads === 1 ? "" : "s"} washed this period`;
  doc.text(loadsText, margin + 10, y + 19);
  if (opts.totalKg > 0) {
    const loadsTextWidth = doc.getTextWidth(loadsText);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_500);
    doc.text(`· ${opts.totalKg.toFixed(1)} kg`, margin + 10 + loadsTextWidth + 8, y + 19);
  }

  y += 30 + 16;

  // ---- Orders table ----
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [["Date", "Order No.", "Customer", "Item", "Status", "Payment", "Method", "Amount"]],
    body: opts.rows.map((r) => [
      formatDateTime(r.drop_off_at),
      r.order_number,
      r.customer_name ?? "Walk-in",
      r.item_label ?? "—",
      ORDER_STATUS_LABEL[r.status] ?? r.status,
      PAYMENT_STATUS_LABEL[r.payment_status] ?? r.payment_status,
      r.payment_method ?? "—",
      { content: peso(r.grand_total), styles: { halign: "right" } },
    ]),
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      7: { halign: "right" },
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

export function generateSalesReportPdf(opts: SalesReportOptions) {
  const doc = buildSalesReportDoc(opts);
  const filenamePart = opts.periodLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`sales-report-${filenamePart}.pdf`);
}
