import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Gift, Search, Coins, Ticket, Users } from "lucide-react";
import { select, formatDateTime } from "../lib/db";
import { EmptyState } from "../components/ListRow";

type PeriodFilter = "today" | "week" | "month" | "custom";

interface RedemptionRow {
  id: number;
  customer_id: number;
  order_id: number | null;
  points: number;
  created_at: string;
  customer_name: string | null;
  order_number: string | null;
  discount_total: number | null;
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

export default function LoyaltyRedemptions() {
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    select<RedemptionRow>(
      `SELECT e.id, e.customer_id, e.order_id, e.points, e.created_at,
              c.full_name AS customer_name,
              o.order_number, o.discount_total
       FROM loyalty_point_events e
       LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN orders o ON o.id = e.order_id
       WHERE e.type = 'redeem'
       ORDER BY e.created_at DESC`,
    ).then(setRedemptions);
  }, []);

  const inPeriod = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) return redemptions;
    return redemptions.filter((r) => {
      const d = r.created_at.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [redemptions, period, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inPeriod;
    return inPeriod.filter(
      (r) =>
        (r.customer_name ?? "walk-in").toLowerCase().includes(q) ||
        (r.order_number ?? "").toLowerCase().includes(q),
    );
  }, [inPeriod, searchQuery]);

  const stats = useMemo(() => {
    const count = inPeriod.length;
    const points = inPeriod.reduce((s, r) => s + Math.abs(r.points), 0);
    const discount = inPeriod.reduce((s, r) => s + (r.discount_total ?? 0), 0);
    const customerIds = new Set(inPeriod.map((r) => r.customer_id));
    return { count, points, discount, customers: customerIds.size };
  }, [inPeriod]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/customers"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Redeemed Points</h1>
          <p className="truncate text-xs text-ink/50">Loyalty point redemptions and the discounts they cost you.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Coins size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{stats.discount.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Total discounted</p>
          <p className="truncate text-[8px] text-white/60">this period</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Ticket size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.points}</p>
          <p className="truncate text-[9px] text-ink/50">Points redeemed</p>
          <p className="truncate text-[8px] font-semibold text-amber-600">
            {stats.count} redemption{stats.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Users size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.customers}</p>
          <p className="truncate text-[9px] text-ink/50">Customers</p>
          <p className="truncate text-[8px] font-semibold text-blue-600">redeemed</p>
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customer or order no.…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

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
        <EmptyState text={redemptions.length === 0 ? "No points redeemed yet." : "No redemptions match your filters."} />
      )}

      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.id} className="rounded-2xl bg-surface shadow-sm">
            <Link
              to={r.order_id ? `/sales/${r.order_id}` : "#"}
              className="flex items-center gap-3 p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Gift size={17} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{r.customer_name ?? "Walk-in"}</p>
                <p className="truncate text-xs text-ink/50">
                  {r.order_number ?? "—"} · {Math.abs(r.points)} pts · {formatDateTime(r.created_at)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-red-500">
                -₱{(r.discount_total ?? 0).toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
