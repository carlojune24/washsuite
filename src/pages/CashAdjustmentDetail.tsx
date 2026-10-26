import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { execute, select, formatTime } from "../lib/db";
import { useAuth } from "../lib/auth";
import type { CashflowEntry } from "../types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  card: "Card",
  bank_transfer: "Bank Transfer",
};

export default function CashAdjustmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasAccess } = useAuth();
  const [entry, setEntry] = useState<CashflowEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    if (!id) return;
    select<CashflowEntry>("SELECT * FROM cashflow_entries WHERE id = ? AND source = 'adjustment'", [id]).then(
      ([row]) => {
        setEntry(row ?? null);
        setLoading(false);
      },
    );
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!entry) {
    return <p className="py-10 text-center text-sm text-ink/40">Adjustment not found.</p>;
  }

  const direction = entry.entry_type === "income" ? "Cash injection" : "Owner withdrawal";

  function confirmRollback() {
    toast(`Roll back this ${direction.toLowerCase()}?`, {
      description: "Removes it from Cashflow entirely. This can't be undone.",
      action: { label: "Roll back", onClick: () => rollback() },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  }

  async function rollback() {
    if (!entry) return;
    setRollingBack(true);
    try {
      await execute("DELETE FROM cashflow_entries WHERE id = ?", [entry.id]);
      toast.success("Adjustment rolled back");
      navigate("/cashflow");
    } catch (err) {
      toast.error(`Couldn't roll back: ${String(err instanceof Error ? err.message : err)}`);
      setRollingBack(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{entry.description || direction}</h1>
          <p className="truncate text-xs text-ink/50">
            {entry.entry_date.slice(0, 10)} · {formatTime(entry.entry_date)}
          </p>
        </div>
      </div>

      <div
        className={
          "mb-4 rounded-2xl p-4 text-white shadow-sm " +
          (entry.entry_type === "income"
            ? "bg-gradient-to-br from-emerald-600 to-emerald-500"
            : "bg-gradient-to-br from-red-600 to-red-500")
        }
      >
        <p className="text-xs font-medium text-white/70">{direction}</p>
        <p className="mt-0.5 text-2xl font-semibold">
          {entry.entry_type === "expense" ? "-" : "+"}₱{entry.amount.toFixed(2)}
        </p>
      </div>

      {entry.method && (
        <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
          <p className="text-sm text-ink/70">
            <span className="text-ink/40">Method: </span>
            {METHOD_LABEL[entry.method] ?? entry.method}
          </p>
        </div>
      )}

      {hasAccess("adjustment_rollback") && (
        <button
          type="button"
          onClick={confirmRollback}
          disabled={rollingBack}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 shadow-sm disabled:opacity-50"
        >
          <Undo2 size={16} strokeWidth={2.2} />
          {rollingBack ? "Rolling back…" : "Roll back"}
        </button>
      )}
    </div>
  );
}
