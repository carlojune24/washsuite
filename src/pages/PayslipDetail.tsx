import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileDown, Wallet, HandCoins, Clock3, TrendingDown, TrendingUp, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { STANDARD_SHIFT_HOURS, describeBasicSalary } from "../lib/payroll";
import { generatePayslipReportPdf } from "../lib/payslipReport";
import { fetchPayslipData, toPayslipReportOptions, PAY_TYPE_LABEL, employeeIdFor, periodLabel, type PayslipData } from "../lib/payslipData";

const AVATAR_PALETTE = [
  "bg-pink-100 text-pink-600",
  "bg-blue-100 text-blue-600",
  "bg-purple-100 text-purple-600",
  "bg-amber-100 text-amber-600",
  "bg-emerald-100 text-emerald-600",
  "bg-cyan-100 text-cyan-600",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function peso(n: number) {
  return `₱${n.toFixed(2)}`;
}

function formatHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function PayslipDetail() {
  const { runId, workerId } = useParams();
  const [data, setData] = useState<PayslipData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchPayslipData(runId!, workerId!).then(setData);
  }, [runId, workerId]);

  function handleExportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      generatePayslipReportPdf(toPayslipReportOptions(data, "WashSuite"));
      toast.success("Payslip exported");
    } catch (err) {
      console.error("Payslip PDF export failed:", err);
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setExporting(false);
    }
  }

  if (!data) return null;
  const { run, worker, payslip, deductions, cashAdvanceTotal, overtimeMultiplier, agg, breakdown, grossPay, netPay, totalDeductions } = data;
  const isPaid = !!payslip.paid_at;
  const deductionTotals = deductions.reduce(
    (acc, d) => ({ employee: acc.employee + d.employee_share, employer: acc.employer + d.employer_share }),
    { employee: 0, employer: 0 },
  );
  const basicSalaryLabel = describeBasicSalary({
    payType: worker.pay_type,
    rate: worker.rate,
    fullDays: agg.full_days,
    regularHours: agg.regular_hours,
  });

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={`/payroll/${run.id}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">Payslip</h1>
          <p className="truncate text-xs text-ink/50">Pay Period: {periodLabel(run)}</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-brand-500/30 bg-surface px-3.5 text-xs font-semibold text-brand-500 shadow-sm disabled:opacity-60"
        >
          <FileDown size={15} strokeWidth={2.2} />
          {exporting ? "Exporting…" : "Download"}
        </button>
      </div>

      <div className="mb-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <Wallet size={16} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-bold">{peso(netPay)}</p>
        <p className="text-xs text-white/70">Net Pay · Take Home Pay</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Wallet size={13} strokeWidth={2.2} />
          </span>
          <p className="truncate text-base font-bold text-emerald-600">{peso(grossPay)}</p>
          <p className="truncate text-[10px] text-ink/40">Gross Pay · Total Earnings</p>
        </div>
        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <HandCoins size={13} strokeWidth={2.2} />
          </span>
          <p className="truncate text-base font-bold text-red-600">{peso(cashAdvanceTotal)}</p>
          <p className="truncate text-[10px] text-ink/40">Cash Advances {isPaid ? "Settled" : "to Settle"}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
        <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " + avatarColor(worker.full_name)}>
          {worker.full_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{worker.full_name}</p>
          <span className="mt-0.5 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-ink/50">
            {PAY_TYPE_LABEL[worker.pay_type]}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Employee ID</p>
          <p className="text-xs font-semibold text-ink">{employeeIdFor(worker)}</p>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Earnings</p>
      <div className="mb-4 space-y-2 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-ink/60">Basic Salary</span>
            <p className="text-[11px] text-ink/35">{basicSalaryLabel}</p>
          </div>
          <span className="font-medium text-ink">{peso(breakdown.basePay)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink/60">Overtime Pay ({overtimeMultiplier}x)</span>
          <span className="font-medium text-ink">{peso(breakdown.overtimePay)}</span>
        </div>
        {breakdown.undertimeDeduction > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink/60">Undertime Deduction</span>
            <span className="font-medium text-amber-600">-{peso(breakdown.undertimeDeduction)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ink/5 pt-2 text-sm">
          <span className="font-semibold text-brand-500">Total Earnings</span>
          <span className="font-bold text-brand-500">{peso(grossPay)}</span>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Deductions</p>
      <div className="mb-4 space-y-2 rounded-2xl bg-surface p-3.5 shadow-sm">
        {deductions.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm">
            <span className="text-ink/60">{d.deduction_name}</span>
            <span className="font-medium text-ink">{peso(d.employee_share)}</span>
          </div>
        ))}
        {cashAdvanceTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink/60">Cash Advances</span>
            <span className="font-medium text-ink">{peso(cashAdvanceTotal)}</span>
          </div>
        )}
        {deductions.length === 0 && cashAdvanceTotal === 0 && <p className="text-sm text-ink/40">No deductions.</p>}
        <div className="flex items-center justify-between border-t border-ink/5 pt-2 text-sm">
          <span className="font-semibold text-red-600">Total Deductions</span>
          <span className="font-bold text-red-600">{peso(totalDeductions)}</span>
        </div>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Clock3 size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Hours</p>
            <p className="truncate text-base font-bold text-blue-600">{formatHM(agg.total_hours)}</p>
            <p className="truncate text-[9px] text-ink/40">Rendered</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Overtime</p>
            <p className="truncate text-base font-bold text-emerald-600">{formatHM(agg.overtime_hours)}</p>
            <p className="truncate text-[9px] text-ink/40">@ {overtimeMultiplier}x</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <TrendingDown size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Undertime</p>
            <p className="truncate text-base font-bold text-amber-600">{formatHM(agg.undertime_hours)}</p>
            <p className="truncate text-[9px] text-ink/40">Below {STANDARD_SHIFT_HOURS}h</p>
          </div>
          <div>
            <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <CalendarDays size={12} strokeWidth={2.2} />
            </span>
            <p className="truncate text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Days</p>
            <p className="truncate text-base font-bold text-ink">{agg.full_days}</p>
            <p className="truncate text-[9px] text-ink/40">Present</p>
          </div>
        </div>
        <div className="mt-3 border-t border-ink/5 pt-2.5 text-center text-[11px] text-ink/40">
          Standard work hours: {STANDARD_SHIFT_HOURS}h 00m / day
        </div>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">DTR Summary</p>
          <Link to={`/payroll/${run.id}/dtr/${worker.id}`} className="text-xs font-semibold text-brand-500">
            View Daily DTR
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-muted p-2.5">
            <p className="text-sm font-bold text-ink">{formatHM(agg.regular_hours)}</p>
            <p className="text-[9px] text-ink/40">Regular</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-2.5">
            <p className="text-sm font-bold text-emerald-600">{formatHM(agg.overtime_hours)}</p>
            <p className="text-[9px] text-ink/40">Overtime</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-2.5">
            <p className="text-sm font-bold text-amber-600">{formatHM(agg.undertime_hours)}</p>
            <p className="text-[9px] text-ink/40">Undertime</p>
          </div>
        </div>
      </div>

      {breakdown.overtimePay > 0 && (
        <div className="mb-4 rounded-2xl border border-brand-500/20 bg-brand-200/10 p-3.5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-brand-500 uppercase">Overtime Calculation</p>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-[10px] text-ink/40">Overtime Hours</p>
              <p className="font-semibold text-ink">{formatHM(agg.overtime_hours)}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink/40">Multiplier</p>
              <p className="font-semibold text-ink">x{overtimeMultiplier}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-ink/40">Overtime Pay</p>
              <p className="font-bold text-emerald-600">{peso(breakdown.overtimePay)}</p>
            </div>
          </div>
        </div>
      )}

      {deductions.length > 0 && (
        <>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Gov't Mandatory Deductions</p>
          <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
            <div className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold tracking-wide text-ink/40 uppercase">
              <span className="flex-1">Deduction</span>
              <span className="w-16 text-right">Employee</span>
              <span className="w-16 text-right">Employer</span>
              <span className="w-16 text-right">Total</span>
            </div>
            {deductions.map((d) => (
              <div key={d.id} className="flex items-center gap-2 border-t border-ink/5 py-2 text-xs">
                <span className="flex-1 truncate font-medium text-ink">{d.deduction_name}</span>
                <span className="w-16 text-right text-ink/70">{peso(d.employee_share)}</span>
                <span className="w-16 text-right text-ink/70">{peso(d.employer_share)}</span>
                <span className="w-16 text-right font-semibold text-ink">{peso(d.employee_share + d.employer_share)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-ink/10 pt-2 text-xs">
              <span className="flex-1 font-bold text-brand-500">Total</span>
              <span className="w-16 text-right font-bold text-brand-500">{peso(deductionTotals.employee)}</span>
              <span className="w-16 text-right font-bold text-brand-500">{peso(deductionTotals.employer)}</span>
              <span className="w-16 text-right font-bold text-brand-500">{peso(deductionTotals.employee + deductionTotals.employer)}</span>
            </div>
          </div>
        </>
      )}

      <div className="rounded-2xl bg-surface-muted p-4 text-center">
        <p className="text-sm font-semibold text-ink">Thank you for your hard work!</p>
        <p className="mt-0.5 text-xs text-ink/40">Payslip is system generated and does not require a signature.</p>
      </div>
    </div>
  );
}
