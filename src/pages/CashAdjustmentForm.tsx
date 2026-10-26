import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { execute, select, toEntryTimestamp } from "../lib/db";
import type { PaymentStatus, PaymentMethod } from "../types";
import { localDate } from "../lib/localDate";

type Direction = "withdrawal" | "injection";

interface FundsRow {
  entry_type: "income" | "expense";
  source: "sale" | "expense" | "payroll" | "government" | "adjustment";
  amount: number;
  order_payment_status: PaymentStatus | null;
}

function today() {
  return localDate(new Date());
}

export default function CashAdjustmentForm() {
  const navigate = useNavigate();

  const [direction, setDirection] = useState<Direction>("withdrawal");
  const [amount, setAmount] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableFunds, setAvailableFunds] = useState<number | null>(null);

  useEffect(() => {
    select<FundsRow>(
      `SELECT e.entry_type, e.source, e.amount, o.payment_status AS order_payment_status
       FROM cashflow_entries e
       LEFT JOIN orders o ON e.source = 'sale' AND e.source_id = o.id`,
    ).then((rows) => {
      const isReceivable = (r: FundsRow) => r.source === "sale" && r.order_payment_status !== "paid";
      const totalIn = rows.filter((r) => r.entry_type === "income" && !isReceivable(r)).reduce((s, r) => s + r.amount, 0);
      const totalOut = rows.filter((r) => r.entry_type === "expense").reduce((s, r) => s + r.amount, 0);
      setAvailableFunds(totalIn - totalOut);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (direction === "withdrawal") {
      if (availableFunds == null) {
        setError("Still loading available funds — try again in a moment.");
        return;
      }
      if (amt > availableFunds) {
        setError(`Withdrawal exceeds available funds (₱${availableFunds.toFixed(2)}).`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const defaultDescription = direction === "withdrawal" ? "Owner withdrawal" : "Owner cash injection";
      await execute(
        `INSERT INTO cashflow_entries (branch_id, entry_type, source, amount, description, entry_date, method)
         VALUES (1, ?, 'adjustment', ?, ?, ?, ?)`,
        [
          direction === "withdrawal" ? "expense" : "income",
          amt,
          note.trim() || defaultDescription,
          toEntryTimestamp(adjustmentDate),
          paymentMethod,
        ],
      );

      navigate("/cashflow");
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
          to="/cashflow"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Cash adjustment</h1>
          <p className="truncate text-xs text-ink/50">Owner withdrawal or capital injection, outside normal sales/expenses</p>
        </div>
      </div>

      <div className="mb-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <p className="text-xs font-medium text-white/70">Available funds</p>
        <p className="mt-0.5 text-2xl font-semibold">{availableFunds == null ? "…" : `₱${availableFunds.toFixed(2)}`}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
          {(["withdrawal", "injection"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={
                "flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-colors " +
                (direction === d
                  ? d === "withdrawal"
                    ? "bg-red-500 text-white"
                    : "bg-emerald-500 text-white"
                  : "text-ink/50")
              }
            >
              {d === "withdrawal" ? "Withdrawal" : "Injection"}
            </button>
          ))}
        </div>
        <p className="px-1 text-xs text-ink/40">
          {direction === "withdrawal"
            ? "Money the owner is taking out of the business."
            : "Money the owner is putting into the business."}
        </p>

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
              value={adjustmentDate}
              onChange={(e) => setAdjustmentDate(e.target.value)}
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
              {m === "gcash" ? "GCash" : "Cash"}
            </button>
          ))}
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={direction === "withdrawal" ? "Owner withdrawal" : "Owner cash injection"}
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : direction === "withdrawal" ? "Record withdrawal" : "Record injection"}
        </button>
      </form>
    </div>
  );
}
