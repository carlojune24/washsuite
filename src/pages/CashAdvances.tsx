import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, HandCoins, Wallet, CheckCircle2, BarChart3 } from "lucide-react";
import { select } from "../lib/db";
import type { CashAdvance } from "../types";
import { EmptyState, PageHeading } from "../components/ListRow";

type PeriodFilter = "today" | "week" | "month" | "custom";

interface CashAdvanceRow extends CashAdvance {
  worker_name: string;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function periodRange(period: PeriodFilter, customFrom: string, customTo: string): { from: string; to: string } | null {
  const now = new Date();
  if (period === "today") {
    const d = toISODate(now);
    return { from: d, to: d };
  }
  if (period === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    return { from: toISODate(monday), to: toISODate(now) };
  }
  if (period === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(first), to: toISODate(now) };
  }
  if (!customFrom && !customTo) return null;
  return { from: customFrom || "0000-01-01", to: customTo || "9999-12-31" };
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

export default function CashAdvances() {
  const [advances, setAdvances] = useState<CashAdvanceRow[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    select<CashAdvanceRow>(
      `SELECT ca.*, w.full_name AS worker_name
       FROM cash_advances ca
       JOIN workers w ON w.id = ca.worker_id
       ORDER BY ca.advance_date DESC`,
    ).then(setAdvances);
  }, []);

  const filtered = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) return advances;
    return advances.filter((a) => {
      const d = a.advance_date.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [advances, period, customFrom, customTo]);

  // Outstanding balance is real debt owed right now — kept all-time, not scoped to the period filter,
  // same reasoning as the "available funds" guard on the cash-adjustment form.
  const outstanding = useMemo(() => advances.filter((a) => a.status === "outstanding"), [advances]);
  const outstandingTotal = outstanding.reduce((s, a) => s + a.amount, 0);

  const stats = useMemo(() => {
    const settled = filtered.filter((a) => a.status === "settled");
    const total = filtered.reduce((s, a) => s + a.amount, 0);
    const average = filtered.length > 0 ? total / filtered.length : 0;
    return {
      issuedCount: filtered.length,
      issuedSum: total,
      settledCount: settled.length,
      settledSum: settled.reduce((s, a) => s + a.amount, 0),
      average,
    };
  }, [filtered]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Cash Advances" />
        <Link
          to="/cash-advances/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="New cash advance"
        >
          <Plus size={18} strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <HandCoins size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{outstandingTotal.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Outstanding</p>
          <p className="truncate text-[8px] text-white/60">
            {outstanding.length} worker{outstanding.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.issuedCount}</p>
          <p className="truncate text-[9px] text-ink/50">Issued</p>
          <p className="truncate text-[8px] font-semibold text-red-600">₱{stats.issuedSum.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.settledCount}</p>
          <p className="truncate text-[9px] text-ink/50">Settled</p>
          <p className="truncate text-[8px] font-semibold text-emerald-600">₱{stats.settledSum.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <BarChart3 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{stats.average.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Average</p>
          <p className="truncate text-[8px] font-semibold text-blue-600">per advance</p>
        </div>
      </div>

      <div className="mb-2 flex gap-1.5 overflow-x-auto">
        {(["today", "week", "month", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
              (period === p ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
            }
          >
            {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
        </div>
      )}

      <div className="mb-4" />

      {filtered.length === 0 && (
        <EmptyState text={advances.length === 0 ? "No cash advances yet." : "No cash advances in this period."} />
      )}

      <ul className="space-y-2">
        {filtered.map((a) => {
          const isOutstanding = a.status === "outstanding";
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              <span
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                  avatarColor(a.worker_name)
                }
              >
                {a.worker_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{a.worker_name}</p>
                <p className="truncate text-xs text-ink/40">
                  {a.advance_date.slice(0, 10)}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={"text-sm font-semibold " + (isOutstanding ? "text-red-600" : "text-ink/40")}>
                  ₱{a.amount.toFixed(2)}
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                    (isOutstanding ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700")
                  }
                >
                  {isOutstanding ? "Outstanding" : "Settled"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
