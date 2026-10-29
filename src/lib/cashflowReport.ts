import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CashflowEntry, PaymentMethod } from "../types";
import { formatTime } from "./db";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const RED_600: [number, number, number] = [220, 38, 38];
const AMBER_600: [number, number, number] = [217, 119, 6];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "E-wallet",
  card: "Card",
  bank_transfer: "Bank Transfer",
};

const SOURCE_LABEL: Record<CashflowEntry["source"], string> = {
  sale: "Sale",
  expense: "Expense",
  restock: "Restock",
  payroll: "Payroll",
  government: "Gov't Remittance",
  adjustment: "Adjustment",
};

export interface CashflowReportEntry {
  entry_date: string;
  entry_type: "income" | "expense";
  source: CashflowEntry["source"];
  description: string | null;
  method: PaymentMethod | null;
  amount: number;
  receivable: boolean;
}

export interface CashflowReportOptions {
  businessName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  periodLabel: string;
  filterLabel: string;
  incomeSum: number;
  incomeCount: number;
  expenseSum: number;
  expenseCount: number;
  net: number;
  pendingSum: number;
  pendingCount: number;
  methodBreakdown: Record<PaymentMethod, number>;
  loads: number;
  kg: number;
  orderCount: number;
  entries: CashflowReportEntry[];
}

function peso(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}P${Math.abs(n).toFixed(2)}`;
}

function money(n: number) {
  return `${n < 0 ? "-" : "+"}${peso(Math.abs(n))}`;
}

function dayHeading(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildCashflowReportDoc(opts: CashflowReportOptions): jsPDF {
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
  doc.text("Cashflow Report", margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });
  if (opts.branchName) {
    doc.text(opts.branchName + (opts.branchAddress ? ` · ${opts.branchAddress}` : ""), pageWidth - margin, 47, {
      align: "right",
    });
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
    { label: "Income", value: peso(opts.incomeSum), sub: `${opts.incomeCount} txn${opts.incomeCount === 1 ? "" : "s"}`, color: EMERALD_600 },
    { label: "Expenses", value: peso(opts.expenseSum), sub: `${opts.expenseCount} txn${opts.expenseCount === 1 ? "" : "s"}`, color: RED_600 },
    { label: "Profit/Loss", value: money(opts.net), color: opts.net < 0 ? RED_600 : EMERALD_600 },
    {
      label: "Pending (Unpaid Sales)",
      value: peso(opts.pendingSum),
      sub: `${opts.pendingCount} order${opts.pendingCount === 1 ? "" : "s"} · not counted above`,
      color: AMBER_600,
    },
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

  y += cardHeight + 22;

  // ---- Loads / operations line ----
  doc.setFillColor(...SLATE_100);
  doc.roundedRect(margin, y, usableWidth, 34, 4, 4, "F");
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const loadsText = `${opts.loads} load${opts.loads === 1 ? "" : "s"} washed this period`;
  doc.text(loadsText, margin + 10, y + 21);
  const loadsTextWidth = doc.getTextWidth(loadsText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  const loadsSub = `${opts.kg > 0 ? `${opts.kg.toFixed(1)} kg · ` : ""}${opts.orderCount} order${opts.orderCount === 1 ? "" : "s"} logged`;
  doc.text(loadsSub, margin + 10 + loadsTextWidth + 16, y + 21);

  y += 34 + 18;

  // ---- Cash breakdown table ----
  const methods = Object.keys(opts.methodBreakdown) as PaymentMethod[];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Payment Method", "Net Movement (this period)"]],
    body: methods.map((m) => [METHOD_LABEL[m], money(opts.methodBreakdown[m])]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    tableWidth: usableWidth,
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  // ---- Transactions table, grouped by day ----
  const byDay = new Map<string, CashflowReportEntry[]>();
  for (const e of opts.entries) {
    const d = e.entry_date.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const columns = ["Time", "Description", "Category", "Method", "Type", "Amount"];
  const body: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
  for (const [date, rows] of days) {
    body.push([
      {
        content: dayHeading(date),
        colSpan: columns.length,
        styles: { fillColor: SLATE_100, textColor: BRAND_900, fontStyle: "bold", halign: "left" },
      },
    ]);
    let dayNet = 0;
    for (const r of rows.sort((a, b) => b.entry_date.localeCompare(a.entry_date))) {
      if (!r.receivable) dayNet += r.entry_type === "income" ? r.amount : -r.amount;
      body.push([
        formatTime(r.entry_date),
        r.description || SOURCE_LABEL[r.source],
        SOURCE_LABEL[r.source],
        r.method ? METHOD_LABEL[r.method] : "—",
        r.receivable ? "Pending" : r.entry_type === "income" ? "Income" : "Expense",
        {
          content: `${r.entry_type === "expense" ? "-" : r.receivable ? "" : "+"}${peso(r.amount)}`,
          styles: {
            textColor: r.receivable ? SLATE_500 : r.entry_type === "expense" ? RED_600 : EMERALD_600,
            halign: "right",
          },
        },
      ]);
    }
    body.push([
      {
        content: "Day net",
        colSpan: columns.length - 1,
        styles: { fontStyle: "bold", halign: "right", textColor: SLATE_500 },
      },
      {
        content: money(dayNet),
        styles: { fontStyle: "bold", halign: "right", textColor: dayNet < 0 ? RED_600 : EMERALD_600 },
      },
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [columns],
    body,
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 90 },
      3: { cellWidth: 80 },
      4: { cellWidth: 60 },
      5: { cellWidth: 80, halign: "right" },
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

export function generateCashflowReportPdf(opts: CashflowReportOptions) {
  const doc = buildCashflowReportDoc(opts);
  const filenamePart = opts.periodLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`cashflow-report-${filenamePart}.pdf`);
}
