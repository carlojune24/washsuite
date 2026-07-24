import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Attendance } from "../types";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_300: [number, number, number] = [203, 213, 225];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const RED_600: [number, number, number] = [220, 38, 38];
const AMBER_600: [number, number, number] = [217, 119, 6];

const STATUS_LABEL: Record<Attendance["status"], string> = {
  present: "Present",
  absent: "Absent",
  leave: "On Leave",
  half_day: "Half Day",
};

export interface DtrReportDay {
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  hours_worked: number | null;
  overtime_hours: number;
  undertime_hours: number;
  status: Attendance["status"] | null;
}

export interface DtrReportOptions {
  businessName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  workerName: string;
  position?: string | null;
  periodLabel: string;
  days: DtrReportDay[];
  totalHours: number;
  totalOvertime: number;
  totalUndertime: number;
}

function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function weekdayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { weekday: "short" });
}

function formatTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function buildDtrReportDoc(opts: DtrReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ---- Header band ----
  doc.setFillColor(...BRAND_900);
  doc.rect(0, 0, pageWidth, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.businessName, margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Daily Time Record", margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });
  if (opts.branchName) {
    doc.text(opts.branchName + (opts.branchAddress ? ` · ${opts.branchAddress}` : ""), pageWidth - margin, 47, {
      align: "right",
    });
  }

  let y = 88;
  doc.setTextColor(...BRAND_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(opts.workerName, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  const sub = [opts.position, opts.periodLabel].filter(Boolean).join(" · ");
  doc.text(sub, margin, y + 14);

  y += 34;

  // ---- Day-by-day table ----
  const columns = ["Date", "Day", "Time In", "Time Out", "Hours", "Overtime", "Undertime", "Status"];
  const body = opts.days.map((d) => [
    dayLabel(d.work_date),
    weekdayLabel(d.work_date),
    formatTime(d.time_in),
    formatTime(d.time_out),
    d.hours_worked != null ? d.hours_worked.toFixed(2) : "—",
    d.overtime_hours > 0 ? d.overtime_hours.toFixed(2) : "—",
    d.undertime_hours > 0 ? d.undertime_hours.toFixed(2) : "—",
    d.status ? STATUS_LABEL[d.status] : "No Record",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 56 },
    head: [columns],
    body,
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 40 },
      2: { cellWidth: 60, halign: "right" },
      3: { cellWidth: 60, halign: "right" },
      4: { cellWidth: 50, halign: "right" },
      5: { cellWidth: 55, halign: "right" },
      6: { cellWidth: 55, halign: "right" },
      7: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7 && data.cell.raw === "No Record") {
        data.cell.styles.textColor = SLATE_500;
        data.cell.styles.fontStyle = "italic";
      }
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;
      const footerY = pageHeight - 34;

      doc.setDrawColor(...SLATE_300);
      doc.setLineWidth(0.75);
      doc.line(margin, footerY - 16, pageWidth - margin, footerY - 16);

      if (current === pageCount) {
        const parts: { label: string; value: string; color: [number, number, number] }[] = [
          { label: "Total Hours Rendered", value: `${opts.totalHours.toFixed(2)} hrs`, color: EMERALD_600 },
          { label: "Undertime", value: `${opts.totalUndertime.toFixed(2)} hrs`, color: AMBER_600 },
          { label: "Overtime", value: `${opts.totalOvertime.toFixed(2)} hrs`, color: RED_600 },
        ];
        const gap = 24;
        let x = margin;
        for (const part of parts) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...SLATE_500);
          doc.text(part.label, x, footerY - 2);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...part.color);
          doc.text(part.value, x, footerY + 11);
          x += Math.max(doc.getTextWidth(part.label), doc.getTextWidth(part.value)) + gap;
        }
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_500);
      doc.text(`Page ${current} of ${pageCount}`, pageWidth - margin, footerY + 11, { align: "right" });
    },
  });

  return doc;
}

export function generateDtrReportPdf(opts: DtrReportOptions) {
  const doc = buildDtrReportDoc(opts);
  const nameSlug = opts.workerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const periodSlug = opts.periodLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`dtr-${nameSlug}-${periodSlug}.pdf`);
}
