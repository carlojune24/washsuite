import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet, Users, CheckCircle2, Clock, Settings2 } from "lucide-react";
import { select } from "../lib/db";
import type { PayrollRun, Payslip, CashAdvance } from "../types";
import { EmptyState, PageHeading } from "../components/ListRow";

interface RunRow extends PayrollRun {
  worker_count: number;
  gross_total: number;
  net_total: number;
}

function periodLabel(run: PayrollRun) {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(run.period_start)} – ${fmt(run.period_end)}`;
}

export default function Payroll() {
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    async function load() {
      const [rows, draftSlips, advances] = await Promise.all([
        select<PayrollRun & { worker_count: number; gross_total: number; stored_net_total: number }>(
          `SELECT r.*, COUNT(p.id) AS worker_count,
                  COALESCE(SUM(p.gross_pay), 0) AS gross_total,
                  COALESCE(SUM(p.net_pay), 0) AS stored_net_total
           FROM payroll_runs r
           LEFT JOIN payslips p ON p.payroll_run_id = r.id
           GROUP BY r.id
           ORDER BY r.period_start DESC`,
        ),
        // net_pay is only finalized (cash advances subtracted) when a run is marked paid, so for
        // drafts we recompute it here from live outstanding advances instead of trusting the stored
        // value — otherwise this list and the run-detail page show two different "net" totals.
        select<Pick<Payslip, "payroll_run_id" | "worker_id" | "gross_pay" | "deductions">>(
          `SELECT p.payroll_run_id, p.worker_id, p.gross_pay, p.deductions
           FROM payslips p
           JOIN payroll_runs r ON r.id = p.payroll_run_id
           WHERE r.status != 'paid'`,
        ),
        select<CashAdvance>("SELECT * FROM cash_advances WHERE status = 'outstanding'"),
      ]);

      const outstandingByWorker = new Map<number, number>();
      for (const a of advances) outstandingByWorker.set(a.worker_id, (outstandingByWorker.get(a.worker_id) ?? 0) + a.amount);

      const draftNetByRun = new Map<number, number>();
      for (const s of draftSlips) {
        const cashAdvance = outstandingByWorker.get(s.worker_id) ?? 0;
        const net = Math.max(0, s.gross_pay - s.deductions - cashAdvance);
        draftNetByRun.set(s.payroll_run_id, (draftNetByRun.get(s.payroll_run_id) ?? 0) + net);
      }

      setRuns(
        rows.map((r) => ({
          ...r,
          net_total: r.status === "paid" ? r.stored_net_total : (draftNetByRun.get(r.id) ?? 0),
        })),
      );
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const draft = runs.filter((r) => r.status !== "paid");
    const paid = runs.filter((r) => r.status === "paid");
    return {
      draftCount: draft.length,
      paidCount: paid.length,
      paidTotal: paid.reduce((s, r) => s + r.net_total, 0),
    };
  }, [runs]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Payroll" hint="Generate and pay out payroll runs." />
        <div className="flex shrink-0 gap-2">
          <Link
            to="/payroll-settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Payroll settings"
          >
            <Settings2 size={17} strokeWidth={2.2} />
          </Link>
          <Link
            to="/payroll/new"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
            aria-label="New payroll run"
          >
            <Plus size={18} strokeWidth={2.2} />
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{stats.paidTotal.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Paid out</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Clock size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.draftCount}</p>
          <p className="truncate text-[9px] text-ink/50">Draft runs</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.paidCount}</p>
          <p className="truncate text-[9px] text-ink/50">Paid runs</p>
        </div>
      </div>

      {runs.length === 0 && <EmptyState text="No payroll runs yet." />}

      <ul className="space-y-2">
        {runs.map((r) => (
          <li key={r.id}>
            <Link to={`/payroll/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                <Users size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{periodLabel(r)}</p>
                <p className="truncate text-xs text-ink/40">
                  {r.worker_count} worker{r.worker_count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold text-ink">Net ₱{r.net_total.toFixed(2)}</span>
                <span className="text-[10px] text-ink/40">Gross ₱{r.gross_total.toFixed(2)}</span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                    (r.status === "paid"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.status === "approved"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700")
                  }
                >
                  {r.status === "paid" ? "Paid" : r.status === "approved" ? "Approved" : "Draft"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
