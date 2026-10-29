import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ban, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import { useAuth } from "../lib/auth";
import type { Expense } from "../types";
import { EmptyState } from "../components/ListRow";

interface ExpenseDetailRow extends Expense {
  category_name: string | null;
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasAccess } = useAuth();
  const [expense, setExpense] = useState<ExpenseDetailRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    select<ExpenseDetailRow>(
      `SELECT e.*, c.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.id = ?`,
      [id],
    ).then(([row]) => {
      setExpense(row ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!expense) {
    return <p className="py-10 text-center text-sm text-ink/40">Expense not found.</p>;
  }

  function confirmVoid() {
    toast("Void this expense?", {
      description: "It's removed from expenses, reports and cashflow. This can't be undone.",
      action: { label: "Void", onClick: () => voidExpense() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function voidExpense() {
    try {
      await execute("UPDATE expenses SET voided_at = datetime('now') WHERE id = ?", [id]);
      await execute("DELETE FROM cashflow_entries WHERE source = 'expense' AND source_id = ?", [id]);
      toast.success("Expense voided");
      navigate("/expenses");
    } catch (err) {
      toast.error(`Couldn't void: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/expenses"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{expense.description}</h1>
          <p className="truncate text-xs text-ink/50">{expense.expense_date.slice(0, 10)}</p>
        </div>
      </div>

      <div className="mb-4 space-y-1 rounded-2xl bg-surface p-3.5 shadow-sm">
        <p className="text-sm text-ink/70">
          <span className="text-ink/40">Category: </span>
          {expense.category_name ?? "Uncategorized"}
        </p>
        {expense.receipt_ref && (
          <p className="text-sm text-ink/70">
            <span className="text-ink/40">Reference: </span>
            {expense.receipt_ref}
          </p>
        )}
        {expense.notes && (
          <p className="text-sm text-ink/70">
            <span className="text-ink/40">Notes: </span>
            {expense.notes}
          </p>
        )}
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Receipt photo</p>
      {expense.receipt_image ? (
        <img
          src={expense.receipt_image}
          alt="Receipt"
          className="mb-4 w-full rounded-2xl object-cover shadow-sm"
        />
      ) : (
        <div className="mb-4">
          <EmptyState text="No receipt photo attached." />
        </div>
      )}

      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <p className="text-xs font-medium text-white/70">Amount</p>
        <p className="mt-0.5 text-2xl font-semibold">₱{expense.amount.toFixed(2)}</p>
      </div>

      {expense.voided_at ? (
        <p className="mt-4 text-center text-sm font-semibold text-red-600">Voided {expense.voided_at.slice(0, 10)}</p>
      ) : (
        hasAccess("expense_void") && (
          <button
            type="button"
            onClick={confirmVoid}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 shadow-sm"
          >
            <Ban size={16} strokeWidth={2.2} />
            Void expense
          </button>
        )
      )}
    </div>
  );
}
