import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ShieldCheck,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Undo2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { execute, select, toEntryTimestamp } from "../lib/db";
import type {
  DeductionType,
  WorkerDeduction,
  DeductionPayment,
  DeductionPaymentItem,
  Worker,
  PaymentMethod,
} from "../types";

interface Line {
  included: boolean;
  ee: string;
  er: string;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
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

export default function DeductionWorkerDetail() {
  const { workerId } = useParams();
  const [searchParams] = useSearchParams();
  const period = searchParams.get("period") || currentPeriod();
  const backTo = `/deductions?period=${period}`;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [types, setTypes] = useState<DeductionType[]>([]);
  const [assignments, setAssignments] = useState<WorkerDeduction[]>([]);
  const [payment, setPayment] = useState<DeductionPayment | null>(null);
  const [history, setHistory] = useState<DeductionPayment[]>([]);
  const [historyItems, setHistoryItems] = useState<DeductionPaymentItem[]>([]);
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [[w], activeTypes, wd, [p], hist] = await Promise.all([
      select<Worker>("SELECT * FROM workers WHERE id = ?", [workerId]),
      select<DeductionType>("SELECT * FROM deduction_types WHERE is_active = 1 ORDER BY name"),
      select<WorkerDeduction>("SELECT * FROM worker_deductions WHERE worker_id = ?", [workerId]),
      select<DeductionPayment>("SELECT * FROM deduction_payments WHERE worker_id = ? AND period = ?", [
        workerId,
        period,
      ]),
      select<DeductionPayment>(
        "SELECT * FROM deduction_payments WHERE worker_id = ? ORDER BY period DESC LIMIT 6",
        [workerId],
      ),
    ]);
    setWorker(w ?? null);
    setTypes(activeTypes);
    setAssignments(wd);
    setPayment(p ?? null);
    setHistory(hist);

    if (hist.length > 0) {
      const placeholders = hist.map(() => "?").join(",");
      const items = await select<DeductionPaymentItem>(
        `SELECT * FROM deduction_payment_items WHERE payment_id IN (${placeholders})`,
        hist.map((h) => h.id),
      );
      setHistoryItems(items);
    } else {
      setHistoryItems([]);
    }

    const nextLines: Record<number, Line> = {};
    for (const t of activeTypes) {
      const existing = wd.find((a) => a.deduction_type_id === t.id);
      nextLines[t.id] = existing
        ? { included: !!existing.is_active, ee: String(existing.employee_share), er: String(existing.employer_share) }
        : { included: false, ee: String(t.employee_share), er: String(t.employer_share) };
    }
    setLines(nextLines);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId, period]);

  function updateLine(typeId: number, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [typeId]: { ...prev[typeId], ...patch } }));
  }

  const totalEmployeeShare = useMemo(
    () => types.reduce((s, t) => s + (lines[t.id]?.included ? Number(lines[t.id].ee) || 0 : 0), 0),
    [types, lines],
  );
  const totalEmployerShare = useMemo(
    () => types.reduce((s, t) => s + (lines[t.id]?.included ? Number(lines[t.id].er) || 0 : 0), 0),
    [types, lines],
  );

  // The monthly breakdown table: one row per period (most recent first), one column per active
  // deduction type. The current period is synthesized from live `lines` if it hasn't been paid
  // yet, so the table always shows where things stand right now, not just past remittances.
  const monthlyRows = useMemo(() => {
    type Row = { period: string; perType: Record<number, number>; total: number; status: "paid" | "pending" | "current" };
    const rows: Row[] = history.map((h) => {
      const items = historyItems.filter((i) => i.payment_id === h.id);
      const perType: Record<number, number> = {};
      let total = 0;
      for (const it of items) {
        perType[it.deduction_type_id] = it.employee_share;
        total += it.employee_share;
      }
      return { period: h.period, perType, total, status: h.status === "paid" ? "paid" : "pending" };
    });

    if (!history.some((h) => h.period === period)) {
      const perType: Record<number, number> = {};
      for (const t of types) {
        if (lines[t.id]?.included) perType[t.id] = Number(lines[t.id].ee) || 0;
      }
      rows.push({ period, perType, total: totalEmployeeShare, status: "current" });
    }

    return rows.sort((a, b) => b.period.localeCompare(a.period));
  }, [history, historyItems, types, lines, period, totalEmployeeShare]);

  // Shared by both the explicit "Save Deductions" button and "Mark as Paid" — the payment
  // snapshot always reflects amounts that are actually persisted to worker_deductions,
  // so there's no way for the two to drift out of sync.
  async function persistWorkerDeductions() {
    for (const t of types) {
      const line = lines[t.id];
      const ee = Number(line.ee) || 0;
      const er = Number(line.er) || 0;
      const existing = assignments.find((a) => a.deduction_type_id === t.id);
      if (existing) {
        await execute(
          "UPDATE worker_deductions SET employee_share = ?, employer_share = ?, is_active = ? WHERE id = ?",
          [ee, er, line.included ? 1 : 0, existing.id],
        );
      } else if (line.included) {
        await execute(
          "INSERT INTO worker_deductions (worker_id, deduction_type_id, employee_share, employer_share, is_active) VALUES (?, ?, ?, ?, 1)",
          [workerId, t.id, ee, er],
        );
      }
    }
  }

  async function saveDeductions() {
    setSaving(true);
    setError(null);
    try {
      await persistWorkerDeductions();
      await load();
      setMode("view");
      toast.success("Deductions saved");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function markAsPaid() {
    if (!worker) return;
    if (!paymentDate) {
      setError("Pick a payment date.");
      return;
    }
    toast(`Mark ${periodLabel(period)} deductions as paid?`, {
      description: `${worker.full_name} · ₱${(totalEmployeeShare + totalEmployerShare).toFixed(2)} will be recorded in Cashflow.`,
      action: { label: "Confirm", onClick: () => performMarkAsPaid() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function performMarkAsPaid() {
    if (!worker) return;
    setSaving(true);
    setError(null);
    try {
      await persistWorkerDeductions();

      await execute(
        `INSERT INTO deduction_payments (worker_id, period, payment_date, status)
         VALUES (?, ?, ?, 'paid')
         ON CONFLICT(worker_id, period) DO UPDATE SET payment_date = excluded.payment_date, status = 'paid'`,
        [workerId, period, paymentDate],
      );
      const [p] = await select<DeductionPayment>(
        "SELECT * FROM deduction_payments WHERE worker_id = ? AND period = ?",
        [workerId, period],
      );
      await execute("DELETE FROM deduction_payment_items WHERE payment_id = ?", [p.id]);
      let eeTotal = 0;
      let erTotal = 0;
      for (const t of types) {
        const line = lines[t.id];
        if (!line.included) continue;
        const ee = Number(line.ee) || 0;
        const er = Number(line.er) || 0;
        eeTotal += ee;
        erTotal += er;
        await execute(
          "INSERT INTO deduction_payment_items (payment_id, deduction_type_id, employee_share, employer_share) VALUES (?, ?, ?, ?)",
          [p.id, t.id, ee, er],
        );
      }

      // Whatever the actual remittance covers (EE + ER) is real cash leaving the business at this
      // moment, so it belongs in Cashflow — delete-then-reinsert keyed by source_id so re-marking
      // (e.g. correcting the date/amount) never double-counts the expense. Uses its own 'government'
      // source (distinct from 'payroll', which is cash advances) so Cashflow can filter them separately.
      await execute("DELETE FROM cashflow_entries WHERE source = 'government' AND source_id = ?", [p.id]);
      if (eeTotal + erTotal > 0) {
        await execute(
          `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, entry_date, method)
           VALUES (1, 'expense', 'government', ?, ?, ?, ?, ?)`,
          [
            p.id,
            eeTotal + erTotal,
            `Deductions - ${worker.full_name} (${periodLabel(period)})`,
            toEntryTimestamp(paymentDate),
            paymentMethod,
          ],
        );
      }

      await load();
      toast.success("Marked as paid", {
        description: `${worker.full_name} · ${periodLabel(period)} · ₱${(eeTotal + erTotal).toFixed(2)}`,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function rollbackPayment() {
    if (!payment) return;
    toast(`Undo this payment for ${periodLabel(period)}?`, {
      description: "This will also remove it from Cashflow.",
      action: { label: "Rollback", onClick: () => performRollback() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function performRollback() {
    if (!payment) return;
    setSaving(true);
    setError(null);
    try {
      await execute("DELETE FROM cashflow_entries WHERE source = 'government' AND source_id = ?", [payment.id]);
      await execute("DELETE FROM deduction_payment_items WHERE payment_id = ?", [payment.id]);
      await execute("UPDATE deduction_payments SET status = 'pending', payment_date = NULL WHERE id = ?", [
        payment.id,
      ]);
      await load();
      toast("Payment rolled back", {
        description: `${periodLabel(period)} is pending again and no longer counted in Cashflow.`,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!worker) return null;

  const assignedTypes = types.filter((t) => lines[t.id]?.included);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to={backTo}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <span
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
            avatarColor(worker.full_name)
          }
        >
          {worker.full_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">{worker.full_name}</h1>
          <p className="truncate text-xs text-ink/50">{worker.position ?? "No position"}</p>
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
            (worker.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")
          }
        >
          {worker.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {mode === "edit" ? (
        <>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Edit Deductions</p>
            <button
              type="button"
              onClick={() => {
                setMode("view");
                load();
              }}
              className="flex items-center gap-1 text-xs font-semibold text-ink/50"
            >
              <X size={13} strokeWidth={2.4} />
              Cancel
            </button>
          </div>
          <div className="mb-3 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
            {types.length === 0 && (
              <p className="text-sm text-ink/40">
                No deduction types yet. <Link to="/deduction-types" className="text-brand-500 underline">Add one</Link>.
              </p>
            )}
            {types.map((t) => {
              const line = lines[t.id];
              if (!line) return null;
              return (
                <div key={t.id} className="rounded-xl bg-surface-muted p-3">
                  <label className="mb-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={line.included}
                      onChange={(e) => updateLine(t.id, { included: e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <ShieldCheck size={14} strokeWidth={2.2} className="text-brand-500" />
                      {t.name}
                    </span>
                  </label>
                  {line.included && (
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Employee share</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={line.ee}
                          onChange={(e) => updateLine(t.id, { ee: e.target.value })}
                          className="w-full rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Employer share</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={line.er}
                          onChange={(e) => updateLine(t.id, { er: e.target.value })}
                          className="w-full rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}

            {types.length > 0 && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-brand-200/30 px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-ink">Total Employee Share</span>
                  <span className="text-sm font-bold text-ink">₱{totalEmployeeShare.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={saveDeductions}
                  disabled={saving}
                  className="w-full rounded-2xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Deductions"}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Deduction Summary</p>
            <span className="text-xs text-ink/40">{periodLabel(period)}</span>
          </div>
          <div className="mb-3 rounded-2xl bg-surface p-4 shadow-sm">
            {assignedTypes.length === 0 ? (
              <p className="text-sm text-ink/40">
                No deductions configured yet. Tap Edit Deductions below to assign one.
              </p>
            ) : (
              <ul className="space-y-3">
                {assignedTypes.map((t) => {
                  const line = lines[t.id];
                  const ee = Number(line.ee) || 0;
                  const er = Number(line.er) || 0;
                  return (
                    <li key={t.id} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                        <ShieldCheck size={16} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                        <p className="truncate text-xs text-ink/40">
                          EE: ₱{ee.toFixed(2)} · ER: ₱{er.toFixed(2)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-ink">₱{(ee + er).toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {assignedTypes.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-200/30 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-ink">Total Deduction (Employee Share)</span>
                <span className="text-sm font-bold text-ink">₱{totalEmployeeShare.toFixed(2)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMode("edit")}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-brand-500/30 bg-surface py-2.5 text-sm font-semibold text-brand-500"
            >
              <Pencil size={15} strokeWidth={2.2} />
              Edit Deductions
            </button>
          </div>

          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Payment · {periodLabel(period)}
          </p>
          <div className="mb-3 rounded-2xl bg-surface p-4 shadow-sm">
            {payment?.status === "paid" ? (
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={16} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Paid</p>
                  <p className="text-xs text-ink/50">on {payment.payment_date}</p>
                </div>
                <button
                  type="button"
                  onClick={rollbackPayment}
                  disabled={saving}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                >
                  <Undo2 size={14} strokeWidth={2.2} />
                  Rollback
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-ink/50">Total (EE + ER)</span>
                  <span className="font-semibold text-ink">
                    ₱{(totalEmployeeShare + totalEmployerShare).toFixed(2)}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="block rounded-2xl bg-surface-muted px-3.5 py-2.5">
                    <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Payment date</span>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full bg-transparent text-sm text-ink outline-none"
                    />
                  </label>
                  <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
                    {(["cash", "gcash"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={
                          "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                          (paymentMethod === m ? "bg-brand-500 text-white" : "text-ink/50")
                        }
                      >
                        {m === "gcash" ? "GCash" : "Cash"}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={markAsPaid}
                  disabled={saving || totalEmployeeShare + totalEmployerShare === 0}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  <CalendarCheck size={16} strokeWidth={2.2} />
                  Mark as Paid
                </button>
              </>
            )}
          </div>

          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Monthly Breakdown
          </p>
          <div className="mb-3 overflow-x-auto rounded-2xl bg-surface shadow-sm">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] font-semibold tracking-wide text-ink/40 uppercase">
                  <th className="px-3.5 py-3 font-semibold">Month</th>
                  {types.map((t) => (
                    <th key={t.id} className="px-2 py-3 text-right font-semibold whitespace-nowrap">
                      {t.name}
                    </th>
                  ))}
                  <th className="px-2 py-3 text-right font-semibold whitespace-nowrap">Total (EE)</th>
                  <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((r) => (
                  <tr
                    key={r.period}
                    className={"border-b border-gray-50 last:border-0 " + (r.status === "current" ? "bg-brand-200/15" : "")}
                  >
                    <td className="px-3.5 py-3 font-medium whitespace-nowrap text-ink">
                      {periodLabel(r.period)}
                    </td>
                    {types.map((t) => (
                      <td key={t.id} className="px-2 py-3 text-right whitespace-nowrap text-ink/70">
                        ₱{(r.perType[t.id] ?? 0).toFixed(2)}
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right font-semibold whitespace-nowrap text-ink">
                      ₱{r.total.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right whitespace-nowrap">
                      {r.status === "paid" && (
                        <CheckCircle2 size={16} strokeWidth={2.2} className="ml-auto text-emerald-500" />
                      )}
                      {r.status === "pending" && (
                        <AlertTriangle size={16} strokeWidth={2.2} className="ml-auto text-amber-500" />
                      )}
                      {r.status === "current" && (
                        <span className="text-[10px] font-semibold text-brand-500">Current</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
