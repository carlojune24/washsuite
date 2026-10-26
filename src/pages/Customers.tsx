import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, UserPlus, Users, UserPlus2, Crown, Star, Settings2, Gift } from "lucide-react";
import { select } from "../lib/db";
import type { Customer, LoyaltyTier } from "../types";
import { EmptyState, PageHeading } from "../components/ListRow";
import { localDate } from "../lib/localDate";

interface OrderAgg {
  customer_id: number;
  order_count: number;
  total_spend: number;
  last_visit: string | null;
}

type StatusFilter = "all" | "loyal" | "active" | "inactive";

// A customer counts as "active" if they've ordered within this many days.
const ACTIVE_WINDOW_DAYS = 60;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function prevMonthOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tierFor(points: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => b.min_points - a.min_points);
  return sorted.find((t) => points >= t.min_points) ?? null;
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderAgg, setOrderAgg] = useState<OrderAgg[]>([]);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [pointsThisMonth, setPointsThisMonth] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    select<Customer>("SELECT * FROM customers WHERE is_active = 1 ORDER BY created_at DESC").then(setCustomers);
    select<OrderAgg>(
      `SELECT customer_id, COUNT(*) as order_count, SUM(grand_total) as total_spend, MAX(drop_off_at) as last_visit
       FROM orders
       WHERE customer_id IS NOT NULL
       GROUP BY customer_id`,
    ).then(setOrderAgg);
    select<LoyaltyTier>("SELECT * FROM loyalty_tiers WHERE is_active = 1 ORDER BY min_points").then(setTiers);
    const month = currentMonth();
    select<{ total: number | null }>(
      "SELECT SUM(points) as total FROM loyalty_point_events WHERE type = 'earn' AND substr(created_at, 1, 7) = ?",
      [month],
    ).then(([r]) => setPointsThisMonth(r?.total ?? 0));
  }, []);

  const rows = useMemo(() => {
    const cutoff = localDate(new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000));
    return customers.map((c) => {
      const agg = orderAgg.find((a) => a.customer_id === c.id);
      const tier = tierFor(c.loyalty_points, tiers);
      const lastVisit = agg?.last_visit ?? null;
      const status: "active" | "inactive" = lastVisit && lastVisit.slice(0, 10) >= cutoff ? "active" : "inactive";
      return {
        customer: c,
        orderCount: agg?.order_count ?? 0,
        totalSpend: agg?.total_spend ?? 0,
        lastVisit,
        tier,
        status,
      };
    });
  }, [customers, orderAgg, tiers]);

  const stats = useMemo(() => {
    const month = currentMonth();
    const prevMonth = prevMonthOf(month);
    const newThisMonth = customers.filter((c) => c.created_at.slice(0, 7) === month).length;
    const newPrevMonth = customers.filter((c) => c.created_at.slice(0, 7) === prevMonth).length;
    const loyalCount = rows.filter((r) => r.tier != null).length;
    return {
      total: customers.length,
      newThisMonth,
      newChangePct: newPrevMonth > 0 ? ((newThisMonth - newPrevMonth) / newPrevMonth) * 100 : null,
      loyalCount,
      loyalPct: customers.length > 0 ? (loyalCount / customers.length) * 100 : 0,
    };
  }, [customers, rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const c = r.customer;
      if (
        q &&
        !c.full_name.toLowerCase().includes(q) &&
        !(c.phone ?? "").toLowerCase().includes(q) &&
        !(c.address ?? "").toLowerCase().includes(q) &&
        !(c.email ?? "").toLowerCase().includes(q) &&
        !(c.landmark ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter === "loyal" && r.tier == null) return false;
      if (statusFilter === "active" && r.status !== "active") return false;
      if (statusFilter === "inactive" && r.status !== "inactive") return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Customers" hint="Manage your customers and their loyalty." />
        <div className="flex shrink-0 gap-2">
          <Link
            to="/loyalty-redemptions"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Redeemed points"
          >
            <Gift size={17} strokeWidth={2.2} />
          </Link>
          <Link
            to="/loyalty-settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
            aria-label="Loyalty settings"
          >
            <Settings2 size={17} strokeWidth={2.2} />
          </Link>
          <Link
            to="/customers/new"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
            aria-label="Add customer"
          >
            <UserPlus size={17} strokeWidth={2.2} />
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Users size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold text-ink">{stats.total}</p>
          <p className="truncate text-[9px] text-ink/50">Total Customers</p>
          <p className="truncate text-[9px] text-ink/40">All time</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <UserPlus2 size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold text-ink">{stats.newThisMonth}</p>
          <p className="truncate text-[9px] text-ink/50">New This Month</p>
          {stats.newChangePct != null && (
            <p className={"truncate text-[9px] font-semibold " + (stats.newChangePct >= 0 ? "text-emerald-600" : "text-red-600")}>
              {stats.newChangePct >= 0 ? "↑" : "↓"}
              {Math.abs(stats.newChangePct).toFixed(0)}% vs last mo.
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <Crown size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold text-ink">{stats.loyalCount}</p>
          <p className="truncate text-[9px] text-ink/50">Loyal Customers</p>
          <p className="truncate text-[9px] text-ink/40">{stats.loyalPct.toFixed(0)}% of total</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Star size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold">{pointsThisMonth}</p>
          <p className="truncate text-[9px] text-white/70">Points Earned</p>
          <p className="truncate text-[9px] text-white/60">This month</p>
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, address, or email…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", `All (${rows.length})`, undefined],
            ["loyal", `Loyal (${stats.loyalCount})`, "bg-amber-500"],
            ["active", `Active (${rows.filter((r) => r.status === "active").length})`, "bg-emerald-500"],
            ["inactive", `Inactive (${rows.filter((r) => r.status === "inactive").length})`, "bg-red-500"],
          ] as const
        ).map(([key, label, dot]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
              (statusFilter === key ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
            }
          >
            {dot && <span className={"h-1.5 w-1.5 rounded-full " + dot} />}
            {label}
          </button>
        ))}
      </div>
      </div>

      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-28">
      {filtered.length === 0 && (
        <EmptyState text={customers.length === 0 ? "No customers yet." : "No customers match your filters."} />
      )}

      <ul className="space-y-2">
        {filtered.map((r) => {
          const c = r.customer;
          return (
            <li key={c.id}>
              <Link to={`/customers/${c.id}`} className="block rounded-2xl bg-surface p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span
                    className={
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                      avatarColor(c.full_name)
                    }
                  >
                    {initials(c.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.full_name}</p>
                    <p className="truncate text-xs text-ink/40">
                      {[c.phone, c.address].filter(Boolean).join(" · ") || "No details on file"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (r.tier != null
                          ? "bg-amber-100 text-amber-700"
                          : r.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-600")
                      }
                    >
                      {r.tier != null ? "Loyal" : r.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="text-[11px] text-ink/40">
                    {r.lastVisit ? `Last visit ${r.lastVisit.slice(0, 10)}` : "No visits yet"} · {r.orderCount} order
                    {r.orderCount === 1 ? "" : "s"}
                  </p>
                  <div className="shrink-0 text-right">
                    <span className="flex items-center justify-end gap-1 text-xs font-semibold text-ink">
                      <Star size={12} strokeWidth={2.2} className="text-amber-500" />
                      {c.loyalty_points - c.redeemed_points} pts
                      {r.tier && <span className="font-normal text-ink/40"> · {r.tier.name}</span>}
                    </span>
                    <p className="text-[10px] text-ink/40">
                      {c.loyalty_points} earned · {c.redeemed_points} redeemed
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      </div>
    </div>
  );
}
