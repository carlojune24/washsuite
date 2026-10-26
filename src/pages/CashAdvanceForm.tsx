import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, User, HandCoins } from "lucide-react";
import { execute, select, toEntryTimestamp } from "../lib/db";
import type { CashAdvance, Worker, PaymentMethod } from "../types";
import { localDate } from "../lib/localDate";

function today() {
  return localDate(new Date());
}

export default function CashAdvanceForm() {
  const navigate = useNavigate();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [outstanding, setOutstanding] = useState<CashAdvance[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<Worker>("SELECT * FROM workers WHERE is_active = 1 ORDER BY full_name").then(setWorkers);
    select<CashAdvance>("SELECT * FROM cash_advances WHERE status = 'outstanding'").then(setOutstanding);
  }, []);

  const workerOutstanding = useMemo(() => {
    if (!workerId) return null;
    const rows = outstanding.filter((a) => a.worker_id === Number(workerId));
    if (rows.length === 0) return null;
    return { count: rows.length, total: rows.reduce((s, a) => s + a.amount, 0) };
  }, [outstanding, workerId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const amt = Number(amount);

    if (!workerId) {
      setError("Select a worker.");
      return;
    }
    if (!(amt > 0)) {
      setError("Enter an amount greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await execute(
        `INSERT INTO cash_advances (worker_id, amount, advance_date, note, status)
         VALUES (?, ?, ?, ?, 'outstanding')`,
        [Number(workerId), amt, advanceDate, note.trim() || null],
      );
      const advanceId = res.lastInsertId;
      const worker = workers.find((w) => w.id === Number(workerId));

      await execute(
        `INSERT INTO cashflow_entries (branch_id, entry_type, source, source_id, amount, description, entry_date, method)
         VALUES (1, 'expense', 'payroll', ?, ?, ?, ?, ?)`,
        [advanceId, amt, `Cash advance - ${worker?.full_name ?? ""}`, toEntryTimestamp(advanceDate), paymentMethod],
      );

      navigate("/cash-advances");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/cash-advances"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">New cash advance</h1>
          <p className="truncate text-xs text-ink/50">Deducted in full at the next payroll run</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink/50">
            <User size={13} strokeWidth={2.2} />
            Worker
          </span>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-ink outline-none"
          >
            <option value="">Select a worker</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </select>
        </label>

        {workerOutstanding && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <HandCoins size={16} strokeWidth={2.2} />
            </span>
            <p className="text-xs text-amber-800">
              Already has <span className="font-semibold">₱{workerOutstanding.total.toFixed(2)}</span> outstanding
              across {workerOutstanding.count} advance{workerOutstanding.count === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Amount</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Date</span>
            <input
              type="date"
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        <div className="flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
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
              {m === "gcash" ? "E-wallet" : "Cash"}
            </button>
          ))}
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save cash advance"}
        </button>
      </form>
    </div>
  );
}
