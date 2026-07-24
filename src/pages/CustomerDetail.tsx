import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, MapPin, Phone, Pencil, Receipt, Star, Gift, TrendingUp } from "lucide-react";
import { select, formatDateTime } from "../lib/db";
import type { Customer, Order, LoyaltyTier } from "../types";
import ListRow, { EmptyState } from "../components/ListRow";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pending",
  ready: "Ready",
  claimed: "Claimed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

type ActivityPeriod = "week" | "month" | "all";

function tierFor(points: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => b.min_points - a.min_points);
  return sorted.find((t) => points >= t.min_points) ?? null;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" });
}

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>("month");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      select<Customer>("SELECT * FROM customers WHERE id = ?", [id]),
      select<Order>("SELECT * FROM orders WHERE customer_id = ? ORDER BY drop_off_at DESC", [id]),
      select<LoyaltyTier>("SELECT * FROM loyalty_tiers WHERE is_active = 1 ORDER BY min_points"),
    ]).then(([[c], o, t]) => {
      setCustomer(c ?? null);
      setOrders(o);
      setTiers(t);
      setLoading(false);
    });
  }, [id]);

  const activityStats = useMemo(() => {
    const now = new Date();
    let cutoff: string | null = null;
    if (activityPeriod === "week") {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      cutoff = monday.toISOString().slice(0, 10);
    } else if (activityPeriod === "month") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }
    const inPeriod = cutoff ? orders.filter((o) => o.drop_off_at.slice(0, 10) >= cutoff!) : orders;
    return {
      count: inPeriod.length,
      spend: inPeriod.reduce((s, o) => s + o.grand_total, 0),
    };
  }, [orders, activityPeriod]);

  const monthlyActivity = useMemo(() => {
    const byMonth = new Map<string, { count: number; spend: number }>();
    for (const o of orders) {
      const m = o.drop_off_at.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, { count: 0, spend: 0 });
      const entry = byMonth.get(m)!;
      entry.count += 1;
      entry.spend += o.grand_total;
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([month, v]) => ({ month, ...v }));
  }, [orders]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!customer) {
    return <p className="py-10 text-center text-sm text-ink/40">Customer not found.</p>;
  }

  const available = customer.loyalty_points - customer.redeemed_points;
  const tier = tierFor(customer.loyalty_points, tiers);

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
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-ink">{customer.full_name}</h1>
            {tier && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {tier.name}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink/40">Member since {customer.created_at.slice(0, 10)}</p>
        </div>
        <Link
          to={`/customers/${customer.id}/edit`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
          aria-label="Edit customer"
        >
          <Pencil size={16} strokeWidth={2.2} />
        </Link>
      </div>

      {(customer.phone || customer.address || customer.landmark) && (
        <div className="mb-4 space-y-2 rounded-2xl bg-surface p-3.5 shadow-sm">
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm text-ink/70">
              <Phone size={14} strokeWidth={2.2} className="shrink-0 text-ink/40" />
              {customer.phone}
            </div>
          )}
          {(customer.address || customer.landmark) && (
            <div className="flex items-start gap-2 text-sm text-ink/70">
              <MapPin size={14} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ink/40" />
              <span>
                {customer.address}
                {customer.address && customer.landmark && " · "}
                {customer.landmark && <span className="text-ink/50">near {customer.landmark}</span>}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <PointsStat icon={Star} label="Total points" value={customer.loyalty_points} />
        <PointsStat icon={Gift} label="Redeemed" value={customer.redeemed_points} />
        <PointsStat icon={Star} label="Available" value={available} highlight />
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Activity</p>
      <div className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="mb-3 flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
          {(["week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActivityPeriod(p)}
              className={
                "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                (activityPeriod === p ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {p === "week" ? "This Week" : p === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-lg font-bold text-ink">{activityStats.count}</p>
            <p className="text-[11px] text-ink/50">
              order{activityStats.count === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-ink">₱{activityStats.spend.toFixed(2)}</p>
            <p className="text-[11px] text-ink/50">spent</p>
          </div>
        </div>
      </div>

      {monthlyActivity.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <TrendingUp size={13} strokeWidth={2.2} className="text-brand-500" />
            <p className="text-xs font-semibold tracking-wide text-ink/40 uppercase">Monthly Activity</p>
          </div>
          <div className="mb-4 space-y-2">
            {monthlyActivity.map((m) => (
              <div key={m.month} className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
                <span className="text-sm font-medium text-ink">{monthLabel(m.month)}</span>
                <span className="text-xs text-ink/40">
                  {m.count} order{m.count === 1 ? "" : "s"}
                </span>
                <span className="text-sm font-semibold text-ink">₱{m.spend.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Laundry history</p>

      {orders.length === 0 && <EmptyState text="No orders yet for this customer." />}

      <ul className="space-y-2">
        {orders.map((o) => (
          <ListRow
            key={o.id}
            to={`/sales/${o.id}`}
            icon={Receipt}
            title={o.order_number}
            subtitle={`${STATUS_LABEL[o.status]} · ${formatDateTime(o.drop_off_at)}`}
            value={`₱${o.grand_total.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}

function PointsStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Star;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={"rounded-2xl p-3.5 shadow-sm " + (highlight ? "bg-brand-500" : "bg-surface")}>
      <span
        className={
          "mb-2 flex h-8 w-8 items-center justify-center rounded-xl " +
          (highlight ? "bg-white/20 text-white" : "bg-brand-200/50 text-brand-600")
        }
      >
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <p className={"text-lg font-semibold " + (highlight ? "text-white" : "text-ink")}>{value}</p>
      <p className={"text-[11px] " + (highlight ? "text-white/70" : "text-ink/50")}>{label}</p>
    </div>
  );
}
