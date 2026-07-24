import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_900: [number, number, number] = [17, 46, 129];
const SLATE_100: [number, number, number] = [241, 245, 249];
const SLATE_500: [number, number, number] = [100, 116, 139];
const EMERALD_600: [number, number, number] = [5, 150, 105];
const RED_600: [number, number, number] = [220, 38, 38];
const AMBER_600: [number, number, number] = [217, 119, 6];
const BLUE_600: [number, number, number] = [37, 99, 235];

export interface PayslipDeductionLine {
  name: string;
  employeeShare: number;
  employerShare: number;
}

export interface PayslipReportOptions {
  businessName: string;
  workerName: string;
  payType: string;
  employeeId: string;
  periodLabel: string;
  netPay: number;
  grossPay: number;
  cashAdvanceTotal: number;
  basicSalary: number;
  basicSalaryFormula: string;
  overtimePay: number;
  undertimeDeduction: number;
  overtimeMultiplier: number;
  totalEarnings: number;
  deductions: PayslipDeductionLine[];
  totalDeductions: number;
  totalHours: number;
  totalOvertime: number;
  totalUndertime: number;
  totalDays: number;
  daysPresent: number;
  regularHours: number;
}

function peso(n: number) {
  return `P${n.toFixed(2)}`;
}

function formatHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function card(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sub: string | undefined,
  color: [number, number, number],
  fillDark = false,
) {
  if (fillDark) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, 6, 6, "F");
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setFillColor(...SLATE_100);
    doc.roundedRect(x, y, w, h, 4, 4, "F");
    doc.setDrawColor(...color);
    doc.setLineWidth(2.5);
    doc.line(x, y + 2, x, y + h - 2);
    doc.setTextColor(...SLATE_500);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (!fillDark) doc.setTextColor(...SLATE_500);
  doc.text(label, x + 10, y + 16);
  const WHITE: [number, number, number] = [255, 255, 255];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...(fillDark ? WHITE : color));
  doc.text(value, x + 10, y + 36);
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...(fillDark ? WHITE : SLATE_500));
    doc.text(sub, x + 10, y + 48);
  }
}

export function buildPayslipReportDoc(opts: PayslipReportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
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
  doc.text(`Payslip · Pay Period: ${opts.periodLabel}`, margin, 47);
  const generated = `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - margin, 30, { align: "right" });

  let y = 84;

  // ---- Summary cards ----
  const cardGap = 12;
  const cardH = 58;
  const cardW = (usableWidth - cardGap * 2) / 3;
  card(doc, margin, y, cardW, cardH, "NET PAY", peso(opts.netPay), "Take Home Pay", BRAND_900, true);
  card(doc, margin + cardW + cardGap, y, cardW, cardH, "GROSS PAY", peso(opts.grossPay), "Total Earnings", EMERALD_600);
  card(doc, margin + (cardW + cardGap) * 2, y, cardW, cardH, "CASH ADVANCES", peso(opts.cashAdvanceTotal), "Deducted from pay", RED_600);

  y += cardH + 22;

  // ---- Worker info ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_900);
  doc.text(opts.workerName, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(opts.payType, margin, y + 14);
  doc.text(`Employee ID: ${opts.employeeId}`, pageWidth - margin, y, { align: "right" });

  y += 30;

  // ---- Earnings / Deductions two-column tables ----
  const colGap = 16;
  const colW = (usableWidth - colGap) / 2;

  const earningsBody: (string | { content: string; styles?: Record<string, unknown> })[][] = [
    [{ content: `Basic Salary\n${opts.basicSalaryFormula}`, styles: { fontSize: 8, textColor: SLATE_500 } }, peso(opts.basicSalary)],
    [`Overtime Pay (${opts.overtimeMultiplier}x)`, peso(opts.overtimePay)],
  ];
  if (opts.undertimeDeduction > 0) {
    earningsBody.push(["Undertime Deduction", { content: `-${peso(opts.undertimeDeduction)}`, styles: { textColor: AMBER_600 } }]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - colW },
    tableWidth: colW,
    head: [["EARNINGS", ""]],
    body: earningsBody,
    foot: [["TOTAL EARNINGS", peso(opts.totalEarnings)]],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { textColor: BRAND_900, fontStyle: "bold", fontSize: 8.5 },
    footStyles: { textColor: BLUE_600, fontStyle: "bold", fontSize: 9.5 },
    columnStyles: { 1: { halign: "right" } },
  });
  const earningsFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const deductionBody = opts.deductions.map((d) => [d.name, peso(d.employeeShare)]);
  if (opts.cashAdvanceTotal > 0) deductionBody.push(["Cash Advances", peso(opts.cashAdvanceTotal)]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin + colW + colGap, right: margin },
    tableWidth: colW,
    head: [["DEDUCTIONS", ""]],
    body: deductionBody,
    foot: [["TOTAL DEDUCTIONS", peso(opts.totalDeductions)]],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { textColor: BRAND_900, fontStyle: "bold", fontSize: 8.5 },
    footStyles: { textColor: RED_600, fontStyle: "bold", fontSize: 9.5 },
    columnStyles: { 1: { halign: "right" } },
  });
  const deductionsFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  y = Math.max(earningsFinalY, deductionsFinalY) + 22;

  // ---- DTR stats row ----
  const stats: { label: string; value: string; sub?: string; color: [number, number, number] }[] = [
    { label: "Days Present", value: `${opts.daysPresent} Days`, color: SLATE_500 },
    { label: "Total Hours Rendered", value: formatHM(opts.totalHours), color: BLUE_600 },
    { label: "Total Overtime", value: formatHM(opts.totalOvertime), sub: `@ ${opts.overtimeMultiplier}x`, color: EMERALD_600 },
    { label: "Total Undertime", value: formatHM(opts.totalUndertime), color: AMBER_600 },
  ];
  const statGap = 12;
  const statW = (usableWidth - statGap * 3) / 4;
  const statH = 46;
  stats.forEach((s, i) => {
    const x = margin + i * (statW + statGap);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(s.label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...s.color);
    doc.text(s.value, x, y + 16);
    if (s.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      doc.text(s.sub, x, y + 27);
    }
  });
  y += statH;
  doc.setDrawColor(...SLATE_100);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text("Standard work hours: 8h 00m / day", pageWidth / 2, y, { align: "center" });

  y += 24;

  // ---- DTR summary table ----
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Date Range", "Days", "Hours Rendered", `Overtime (${opts.overtimeMultiplier}x)`, "Undertime"]],
    body: [
      [opts.periodLabel, String(opts.totalDays), formatHM(opts.totalHours), formatHM(opts.totalOvertime), formatHM(opts.totalUndertime)],
      ["Breakdown", "–", `${formatHM(opts.regularHours)}\nRegular`, `${formatHM(opts.totalOvertime)}\nOvertime`, `${formatHM(opts.totalUndertime)}\nUndertime`],
    ],
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 6, halign: "center" },
    headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  // ---- Overtime calculation ----
  if (opts.overtimePay > 0) {
    const boxH = 54;
    doc.setFillColor(240, 245, 255);
    doc.setDrawColor(...BLUE_600);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, usableWidth, boxH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE_600);
    doc.text("OVERTIME CALCULATION", margin + 12, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_500);
    doc.text(`Overtime Hours: ${formatHM(opts.totalOvertime)}   ·   Multiplier: x${opts.overtimeMultiplier}`, margin + 12, y + 36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...EMERALD_600);
    doc.text(`Overtime Pay: ${peso(opts.overtimePay)}`, pageWidth - margin - 12, y + 36, { align: "right" });
    y += boxH + 22;
  }

  // ---- Gov't deductions table ----
  if (opts.deductions.length > 0) {
    const empTotal = opts.deductions.reduce((s, d) => s + d.employeeShare, 0);
    const erTotal = opts.deductions.reduce((s, d) => s + d.employerShare, 0);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 60 },
      head: [["Deduction", "Employee Share", "Employer Share", "Total"]],
      body: opts.deductions.map((d) => [
        d.name,
        peso(d.employeeShare),
        peso(d.employerShare),
        peso(d.employeeShare + d.employerShare),
      ]),
      foot: [["TOTAL", peso(empTotal), peso(erTotal), peso(empTotal + erTotal)]],
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 6 },
      headStyles: { fillColor: BRAND_900, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: 255, textColor: BLUE_600, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 110, halign: "right" },
        2: { cellWidth: 110, halign: "right" },
        3: { cellWidth: 90, halign: "right" },
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  // ---- Footer message ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_900);
  doc.text("Thank you for your hard work!", pageWidth / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  doc.text("Payslip is system generated and does not require a signature.", pageWidth / 2, y + 14, { align: "center" });

  return doc;
}

export function generatePayslipReportPdf(opts: PayslipReportOptions) {
  const doc = buildPayslipReportDoc(opts);
  const nameSlug = opts.workerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const periodSlug = opts.periodLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`payslip-${nameSlug}-${periodSlug}.pdf`);
}
