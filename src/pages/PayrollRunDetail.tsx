import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Wallet,
  Banknote,
  Smartphone,
  CreditCard,
  Landmark,
  CalendarCheck,
  Undo2,
  Trash2,
  HandCoins,
  Clock3,
  FileText,
  FileDown,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { execute, select, toEntryTimestamp } from "../lib/db";
import { fetchDtrDays, sumDtrTotals } from "../lib/dtrData";
import { generateDtrReportPdf } from "../lib/dtrReport";
import { fetchPayslipData, toPayslipReportOptions, type PayslipData } from "../lib/payslipData";
import { describeBasicSalary } from "../lib/payroll";
import { generatePayslipReportPdf } from "../lib/payslipReport";
import type { PayrollRun, Payslip, Worker, PaymentMethod, CashAdvance } from "../types";
import { localDate } from "../lib/localDate";

interface PayslipRow extends Payslip {
  worker_name: string;
  pay_type: Worker["pay_type"];
}

const METHOD_META: Record<PaymentMethod, { label: string; icon: typeof Banknote }> = {
  cash: { label: "Cash", icon: Banknote },
  gcash: { label: "GCash", icon: Smartphone },
  card: { label: "Card", icon: CreditCard },
  bank_transfer: { label: "Bank Transfer", icon: Landmark },
};

const PAY_TYPE_LABEL: Record<Worker["pay_type"], string> = {
  daily: "Daily",
  hourly: "Hourly",
  monthly: "Monthly",
  per_piece: "Per Piece",
};

function periodLabel(run: PayrollRun) {
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(run.period_start)} – ${fmt(run.period_end)}`;
}

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

function formatHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function basicSalaryFormula(data: PayslipData): string {
  return describeBasicSalary({
    payType: data.worker.pay_type,
    rate: data.worker.rate,
    fullDays: data.agg.full_days,
    regularHours: data.agg.regular_hours,
  });
}

export default function PayrollRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [payslipDataByWorker, setPayslipDataByWorker] = useState<Map<number, PayslipData>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingDtrId, setDownloadingDtrId] = useState<number | null>(null);

  async function load() {
    const [[r], slips] = await Promise.all([
      select<PayrollRun>("SELECT * FROM payroll_runs WHERE id = ?", [id]),
      select<PayslipRow>(
        `SELECT p.*, w.full_name AS worker_name, w.pay_type
         FROM payslips p
         JOIN workers w ON w.id = p.worker_id
         WHERE p.payroll_run_id = ?
         ORDER BY w.full_name`,
        [id],
      ),
    ]);
    setRun(r ?? null);

    if (!r) {
      setPayslips([]);
      setPayslipDataByWorker(new Map());
      return;
    }

    const dataList = await Promise.all(slips.map((s) => fetchPayslipData(r.id, s.worker_id)));
    const dataMap = new Map<number, PayslipData>();
    dataList.forEach((d, i) => {
      if (d) dataMap.set(slips[i].worker_id, d);
    });
    setPayslips(slips);
    setPayslipDataByWorker(dataMap);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isDraft = run?.status === "draft";
  const isApproved = run?.status === "approved";
  const isPaid = run?.status === "paid";

  const rows = useMemo(
    () =>
      payslips
        .map((p) => ({ payslip: p, data: payslipDataByWorker.get(p.worker_id) }))
        .filter((r): r is { payslip: PayslipRow; data: PayslipData } => !!r.data),
    [payslips, payslipDataByWorker],
  );

  const canDelete = !isPaid && rows.every((r) => !r.payslip.paid_at);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          const govEE = r.data.deductions.reduce((s, d) => s + d.employee_share, 0);
          const govER = r.data.deductions.reduce((s, d) => s + d.employer_share, 0);
          return {
            gross: acc.gross + r.data.grossPay,
            cashAdvance: acc.cashAdvance + r.data.cashAdvanceTotal,
            gov: acc.gov + govEE + govER,
            govEE: acc.govEE + govEE,
            govER: acc.govER + govER,
            net: acc.net + r.data.netPay,
          };
        },
        { gross: 0, cashAdvance: 0, gov: 0, govEE: 0, govER: 0, net: 0 },
      ),
    [rows],
  );

  function toggleExpanded(payslipId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(payslipId)) next.delete(payslipId);
      else next.add(payslipId);
      return next;
    });
  }

  async function handleDownloadDtr(workerId: number, workerName: string, payslipId: number) {
    if (!run) return;
    setDownloadingDtrId(payslipId);
    try {
      const days = await fetchDtrDays(workerId, run.period_start, run.period_end);
      const dtrTotals = sumDtrTotals(days);
      generateDtrReportPdf({
        businessName: "WashSuite",
        workerName,
        periodLabel: periodLabel(run),
        days,
        totalHours: dtrTotals.hours,
        totalOvertime: dtrTotals.overtime,
        totalUndertime: dtrTotals.undertime,
      });
      toast.success("DTR exported");
    } catch (err) {
      console.error("DTR PDF export failed:", err);
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setDownloadingDtrId(null);
    }
  }

  function handleDownloadPayslip(data: PayslipData) {
    try {
      generatePayslipReportPdf(toPayslipReportOptions(data, "WashSuite"));
      toast.success("Payslip exported");
    } catch (err) {
      console.error("Payslip PDF export failed:", err);
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  function confirmApprove() {
    if (!run) return;
    toast(`Approve payroll for ${periodLabel(run)}?`, {
      description: `${rows.length} worker${rows.length === 1 ? "" : "s"} · ₱${totals.gross.toFixed(2)} gross. You'll mark each employee as paid individually afterward.`,
      action: { label: "Approve", onClick: () => approveRun() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function approveRun() {
    if (!run) return;
    setSaving(true);
    setError(null);
    try {
      await execute("UPDATE payroll_runs SET status = 'approved' WHERE id = ?", [run.id]);
      await load();
      toast.success("Payroll approved", { description: "Mark each employee as paid from their card below." });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function govAmountFor(row: (typeof rows)[number]) {
    return row.data.deductions.reduce((s, d) => s + d.employee_share + d.employer_share, 0);
  }

  function confirmMarkWorkerPaid(row: (typeof rows)[number]) {
    if (!run) return;
    const govAmount = govAmountFor(row);
    toast(`Mark ${row.payslip.worker_name}'s payslip as paid?`, {
      description: `₱${row.data.netPay.toFixed(2)} net pay${
        govAmount > 0 ? ` + ₱${govAmount.toFixed(2)} government deductions (EE + ER)` : ""
      } will be recorded in Cashflow${
        row.data.cashAdvanceTotal > 0 ? `, and ₱${row.data.cashAdvanceTotal.toFixed(2)} in cash advances will be settled` : ""
      }.`,
      action: { label: "Confirm", onClick: () => markWorkerPaid(row) },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function markWorkerPaid(row: (typeof rows)[number]) {
    if (!run) return;
    setSaving(true);
    setError(null);
    try {
      const advances = await select<CashAdvance>(
        "SELECT * FROM cash_advances WHERE worker_id = ? AND status = 'outstanding'",
        [row.payslip.worker_id],
      );
      const cashAdvanceTotal = advances.reduce((s, a) => s + a.amount, 0);
      // Freeze gross pay/deductions from their live (attendance/deduction-derived) values at this
      // exact moment, not the stale snapshot taken when the draft was generated — otherwise an
      // attendance edit made after the run was drafted never makes it into what actually gets paid.
      const grossPay = row.data.breakdown.total;
      const employeeDeductions = row.data.deductions.reduce((s, d) => s + d.employee_share, 0);
      const netPay = Math.max(0, grossPay - employeeDeductions - cashAdvanceTotal);

      await execute(
        "UPDATE payslips SET gross_pay = ?, deductions = ?, net_pay = ?, paid_at = datetime('now') WHERE id = ?",
        [grossPay, employeeDeductions, netPay, row.payslip.id],
      );

      for (const a of advances) {
        await execute("UPDATE cash_advances SET status = 'settled', payslip_id = ? WHERE id = ?", [
          row.payslip.id,
          a.id,
        ]);
      }

      await execute("DELETE FROM cashflow_entries WHERE source = 'payroll' AND source_id = ?", [row.payslip.id]);
      if (netPay > 0) {
        await execute(
          `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, entry_date, method)
           VALUES (1, 'expense', 'payroll', ?, ?, ?, ?, ?)`,
          [
            row.payslip.id,
            netPay,
            `Payroll - ${row.payslip.worker_name} (${periodLabel(run)})`,
            toEntryTimestamp(localDate(new Date())),
            paymentMethod,
          ],
        );
      }

      // EE+ER government contributions are a real cost incurred the moment this payslip is paid,
      // even though the actual remittance to the agency may happen later via the Deductions page.
      // source_id is negated so this shares the 'government' source (same grouping/reporting as
      // Deductions remittances) without colliding with deduction_payments.id, which is a positive,
      // independent ID space.
      const govAmount = govAmountFor(row);
      await execute("DELETE FROM cashflow_entries WHERE source = 'government' AND source_id = ?", [-row.payslip.id]);
      if (govAmount > 0) {
        await execute(
          `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, entry_date, method)
           VALUES (1, 'expense', 'government', ?, ?, ?, ?, ?)`,
          [
            -row.payslip.id,
            govAmount,
            `Government deductions - ${row.payslip.worker_name} (${periodLabel(run)})`,
            toEntryTimestamp(localDate(new Date())),
            paymentMethod,
          ],
        );
      }

      // Once every worker in the run is individually paid, the run itself becomes "paid".
      const [remaining] = await select<{ count: number }>(
        "SELECT COUNT(*) AS count FROM payslips WHERE payroll_run_id = ? AND paid_at IS NULL",
        [run.id],
      );
      if ((remaining?.count ?? 0) === 0) {
        await execute("UPDATE payroll_runs SET status = 'paid' WHERE id = ?", [run.id]);
      }

      await load();
      toast.success(`${row.payslip.worker_name} marked as paid`, {
        description:
          govAmount > 0
            ? `₱${netPay.toFixed(2)} net pay + ₱${govAmount.toFixed(2)} government deductions recorded in Cashflow`
            : `₱${netPay.toFixed(2)} recorded in Cashflow`,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmRollback() {
    toast("Roll back this payroll run to draft?", {
      description: "Un-pays every employee, removes it from Cashflow, and restores any cash advances it settled.",
      action: { label: "Rollback", onClick: () => rollback() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function rollback() {
    if (!run) return;
    setSaving(true);
    setError(null);
    try {
      for (const p of payslips) {
        await execute("DELETE FROM cashflow_entries WHERE source = 'payroll' AND source_id = ?", [p.id]);
        await execute("DELETE FROM cashflow_entries WHERE source = 'government' AND source_id = ?", [-p.id]);
        await execute("UPDATE cash_advances SET status = 'outstanding', payslip_id = NULL WHERE payslip_id = ?", [
          p.id,
        ]);
        await execute("UPDATE payslips SET paid_at = NULL WHERE id = ?", [p.id]);
      }
      await execute("UPDATE payroll_runs SET status = 'draft' WHERE id = ?", [run.id]);
      await load();
      toast("Payroll rolled back", { description: "Run is a draft again and no longer counted in Cashflow." });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteRun() {
    toast("Delete this payroll run?", {
      description: "This can't be undone.",
      action: { label: "Delete", onClick: () => deleteRun() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function deleteRun() {
    if (!run) return;
    setSaving(true);
    setError(null);
    try {
      await execute("DELETE FROM payslips WHERE payroll_run_id = ?", [run.id]);
      await execute("DELETE FROM payroll_runs WHERE id = ?", [run.id]);
      navigate("/payroll");
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  if (!run) return null;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/payroll"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{periodLabel(run)}</h1>
          <p className="truncate text-xs text-ink/50">
            {rows.length} worker{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
            (isPaid ? "bg-emerald-100 text-emerald-700" : isApproved ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")
          }
        >
          {isPaid ? "Paid" : isApproved ? "Approved" : "Draft"}
        </span>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-3.5 text-white shadow-sm">
        <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
          <Wallet size={14} strokeWidth={2.2} />
        </span>
        <p className="truncate text-xl font-bold">₱{totals.net.toFixed(2)}</p>
        <p className="truncate text-[10px] text-white/70">Total net pay</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-emerald-600">₱{totals.gross.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Total gross pay</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <HandCoins size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{totals.cashAdvance.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Cash advances settled</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ShieldCheck size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{totals.gov.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">
            EE ₱{totals.govEE.toFixed(2)} · ER ₱{totals.govER.toFixed(2)}
          </p>
        </div>
      </div>

      <ul className="mb-4 space-y-2">
        {rows.map((r) => {
          const expanded = expandedIds.has(r.payslip.id);
          const { data } = r;
          return (
            <li key={r.payslip.id} className="overflow-hidden rounded-2xl bg-surface shadow-sm">
              <button
                type="button"
                onClick={() => toggleExpanded(r.payslip.id)}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                    avatarColor(r.payslip.worker_name)
                  }
                >
                  {r.payslip.worker_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.payslip.worker_name}</p>
                  <p className="truncate text-xs text-ink/40">{PAY_TYPE_LABEL[r.payslip.pay_type]}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[9px] font-semibold tracking-wide text-ink/40 uppercase">Net Pay</p>
                  <p className="text-sm font-bold text-ink">₱{data.netPay.toFixed(2)}</p>
                </div>
                {expanded ? (
                  <ChevronUp size={16} strokeWidth={2.2} className="shrink-0 text-ink/30" />
                ) : (
                  <ChevronDown size={16} strokeWidth={2.2} className="shrink-0 text-ink/30" />
                )}
              </button>

              {expanded && (
                <div className="border-t border-ink/5 px-3.5 pt-3 pb-3.5">
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-ink/50 uppercase">Days Present</p>
                      <p className="text-sm font-bold text-ink">{data.agg.full_days}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-ink/50 uppercase">Hours Worked</p>
                      <p className="text-sm font-bold text-ink">{formatHM(data.agg.total_hours)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-blue-600/70 uppercase">Gross Pay</p>
                      <p className="text-sm font-bold text-blue-600">₱{r.data.grossPay.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-emerald-600/70 uppercase">
                        Total Overtime
                      </p>
                      <p className="text-sm font-bold text-emerald-600">{formatHM(data.agg.overtime_hours)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-amber-600/70 uppercase">
                        Total Undertime
                      </p>
                      <p className="text-sm font-bold text-amber-600">{formatHM(data.agg.undertime_hours)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-2 text-center">
                      <p className="text-[9px] font-semibold tracking-wide text-red-600/70 uppercase">Deductions</p>
                      <p className="text-sm font-bold text-red-600">₱{data.totalDeductions.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mb-3 space-y-2">
                    <div className="rounded-xl bg-surface-muted p-3">
                      <p className="mb-2 text-[10px] font-semibold tracking-wide text-ink/40 uppercase">Earnings</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <div>
                            <span className="text-ink/60">Basic Salary</span>
                            <p className="text-[10px] text-ink/35">{basicSalaryFormula(data)}</p>
                          </div>
                          <span className="font-medium text-ink">₱{data.breakdown.basePay.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink/60">Overtime Pay ({data.overtimeMultiplier}x)</span>
                          <span className="font-medium text-ink">₱{data.breakdown.overtimePay.toFixed(2)}</span>
                        </div>
                        {data.breakdown.undertimeDeduction > 0 && (
                          <div className="flex justify-between">
                            <span className="text-ink/60">Undertime Deduction</span>
                            <span className="font-medium text-amber-600">
                              -₱{data.breakdown.undertimeDeduction.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-ink/10 pt-1.5">
                          <span className="font-semibold text-brand-500">Total Earnings</span>
                          <span className="font-bold text-brand-500">₱{r.data.grossPay.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-surface-muted p-3">
                      <p className="mb-2 text-[10px] font-semibold tracking-wide text-ink/40 uppercase">Deductions</p>
                      <div className="space-y-1.5 text-xs">
                        {data.deductions.map((d) => (
                          <div key={d.id} className="flex justify-between">
                            <div>
                              <span className="text-ink/60">{d.deduction_name}</span>
                              <p className="text-[10px] text-ink/35">
                                EE ₱{d.employee_share.toFixed(2)} · ER ₱{d.employer_share.toFixed(2)}
                              </p>
                            </div>
                            <span className="font-medium text-ink">₱{d.employee_share.toFixed(2)}</span>
                          </div>
                        ))}
                        {data.cashAdvanceTotal > 0 && (
                          <div className="flex justify-between">
                            <span className="text-ink/60">Cash Advances</span>
                            <span className="font-medium text-ink">₱{data.cashAdvanceTotal.toFixed(2)}</span>
                          </div>
                        )}
                        {data.deductions.length === 0 && data.cashAdvanceTotal === 0 && (
                          <p className="text-ink/40">No deductions.</p>
                        )}
                        <div className="flex justify-between border-t border-ink/10 pt-1.5">
                          <span className="font-semibold text-red-600">Total Deductions</span>
                          <span className="font-bold text-red-600">₱{data.totalDeductions.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {data.breakdown.overtimePay > 0 && (
                      <div className="rounded-xl bg-surface-muted p-3">
                        <p className="mb-2 text-[10px] font-semibold tracking-wide text-ink/40 uppercase">
                          Overtime Details
                        </p>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-ink/60">Overtime Hours</span>
                            <span className="font-medium text-ink">{formatHM(data.agg.overtime_hours)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink/60">Multiplier</span>
                            <span className="font-medium text-ink">x{data.overtimeMultiplier}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink/60">Overtime Pay</span>
                            <span className="font-bold text-emerald-600">₱{data.breakdown.overtimePay.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {data.cashAdvanceTotal > 0 ? (
                    <p className="mb-3 flex items-center gap-1 text-[11px] font-medium text-red-500">
                      <HandCoins size={12} strokeWidth={2.2} />
                      {r.payslip.paid_at ? "Settled" : "Will settle"} ₱{data.cashAdvanceTotal.toFixed(2)} in cash advances
                    </p>
                  ) : (
                    <p className="mb-3 text-[11px] text-ink/30">No cash advances</p>
                  )}

                  {r.payslip.paid_at ? (
                    <p className="mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2 text-xs font-semibold text-emerald-600">
                      <CalendarCheck size={13} strokeWidth={2.2} />
                      Paid ₱{data.netPay.toFixed(2)} on {new Date(r.payslip.paid_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </p>
                  ) : (
                    isApproved && (
                      <button
                        type="button"
                        onClick={() => confirmMarkWorkerPaid(r)}
                        disabled={saving}
                        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
                      >
                        <CalendarCheck size={13} strokeWidth={2.2} />
                        Mark as Paid
                      </button>
                    )
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to={`/payroll/${run.id}/dtr/${r.payslip.worker_id}`}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500"
                    >
                      <Clock3 size={13} strokeWidth={2.2} />
                      View DTR
                    </Link>
                    <Link
                      to={`/payroll/${run.id}/payslip/${r.payslip.worker_id}`}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500"
                    >
                      <FileText size={13} strokeWidth={2.2} />
                      View Payslip
                    </Link>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadPayslip(data)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500"
                    >
                      <FileDown size={13} strokeWidth={2.2} />
                      Download Payslip
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadDtr(r.payslip.worker_id, r.payslip.worker_name, r.payslip.id)}
                      disabled={downloadingDtrId === r.payslip.id}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-muted py-2 text-xs font-semibold text-brand-500 disabled:opacity-60"
                    >
                      <FileDown size={13} strokeWidth={2.2} />
                      {downloadingDtrId === r.payslip.id ? "Exporting…" : "Download DTR"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isDraft && (
        <>
          <button
            type="button"
            onClick={confirmApprove}
            disabled={saving || rows.length === 0}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            <CalendarCheck size={16} strokeWidth={2.2} />
            Approve Payroll
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={confirmDeleteRun}
              disabled={saving}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={2.2} />
              Delete Draft Run
            </button>
          )}
          <p className="text-center text-[11px] text-ink/30">
            This is a draft payroll run. Approve it to start marking employees as paid.
          </p>
        </>
      )}

      {isApproved && (
        <>
          <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Pay via</p>
          <div className="mb-3 flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
            {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
              const Icon = METHOD_META[m].icon;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={
                    "flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors " +
                    (paymentMethod === m ? "bg-brand-500 text-white" : "text-ink/50")
                  }
                >
                  <Icon size={13} strokeWidth={2.2} />
                  {METHOD_META[m].label}
                </button>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-ink/30">
            Payroll approved. Mark each employee as paid from their card above — the run finalizes once everyone's paid.
          </p>
        </>
      )}

      {!isDraft && (
        <button
          type="button"
          onClick={confirmRollback}
          disabled={saving}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-60"
        >
          <Undo2 size={14} strokeWidth={2.2} />
          Rollback to Draft
        </button>
      )}
    </div>
  );
}
