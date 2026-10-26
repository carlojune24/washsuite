import { useEffect, useState } from "react";
import { greeting } from "../lib/greeting";
import { Link } from "react-router-dom";
import { select, formatTime } from "../lib/db";
import {
  Receipt,
  Users,
  Package,
  Plus,
  Settings as SettingsIcon,
  Layers,
  Sparkles,
  Tag,
  Wallet,
  TrendingUp,
  Banknote,
  Coins,
  WashingMachine,
  Gauge,
  IdCard,
  Clock,
  HandCoins,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import type { ComponentType } from "react";
import type { OrderStatus } from "../types";
import { useAuth } from "../lib/auth";
import { sensorServerAvailable } from "../lib/sensors";

interface Counts {
  orders: number;
  loads: number;
  customers: number;
  lowStock: number;
  todaySales: number;
  yesterdaySales: number;
  expensesToday: number;
}

interface RecentOrder {
  id: number;
  status: OrderStatus;
  grand_total: number;
  drop_off_at: string;
  customer_name: string | null;
  item_label: string | null;
}

const QUICK_ACTIONS = [
  { to: "/expenses", label: "Expenses", icon: Wallet, pageKey: "expenses" },
  { to: "/inventory", label: "Stock / Inventory", icon: Package, pageKey: "inventory" },
];

const BUSINESS_ACTIONS = [
    { to: "/attendance", label: "Attendance", icon: Clock, iconClassName: "bg-amber-100 text-amber-600 group-hover:bg-amber-500", pageKey: "attendance" },
    { to: "/cashflow", label: "Cashflow", icon: TrendingUp, iconClassName: "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-500", pageKey: "cashflow" },
    { to: "/expenses", label: "Expenses", icon: Wallet, iconClassName: "bg-red-100 text-red-600 group-hover:bg-red-500", pageKey: "expenses" },
    { to: "/deductions", label: "Deductions", icon: ShieldCheck, iconClassName: "bg-rose-100 text-rose-600 group-hover:bg-rose-500", pageKey: "deductions" },
    { to: "/cash-advances", label: "Cash Advances", icon: HandCoins, iconClassName: "bg-teal-100 text-teal-600 group-hover:bg-teal-500", pageKey: "cash_advances" },
    { to: "/inventory", label: "Stock", icon: Package, iconClassName: "bg-lime-100 text-lime-600 group-hover:bg-lime-500", pageKey: "inventory" },
    { to: "/payroll", label: "Payroll", icon: Banknote, iconClassName: "bg-cyan-100 text-cyan-600 group-hover:bg-cyan-500", pageKey: "payroll" },
  { to: "/services", label: "Services", icon: WashingMachine, iconClassName: "bg-blue-100 text-blue-600 group-hover:bg-blue-500", pageKey: "services" },
  { to: "/settings/machine-status", label: "Machine Status", icon: Gauge, iconClassName: "bg-sky-100 text-sky-600 group-hover:bg-sky-500", pageKey: null },
  { to: "/packages", label: "Packages", icon: Layers, iconClassName: "bg-purple-100 text-purple-600 group-hover:bg-purple-500", pageKey: "packages" },
  { to: "/addons", label: "Add-ons", icon: Sparkles, iconClassName: "bg-pink-100 text-pink-600 group-hover:bg-pink-500", pageKey: "addons" },
  { to: "/promos", label: "Promos", icon: Tag, iconClassName: "bg-orange-100 text-orange-600 group-hover:bg-orange-500", pageKey: "promos" },
  { to: "/employees", label: "Employees", icon: IdCard, iconClassName: "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-500", pageKey: "employees" },
  { to: "/reports", label: "Reports", icon: BarChart3, iconClassName: "bg-violet-100 text-violet-600 group-hover:bg-violet-500", pageKey: "reports" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, iconClassName: "bg-gray-100 text-slate-600 group-hover:bg-slate-500", pageKey: null },
];

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Ready for pickup", className: "bg-blue-100 text-blue-700" },
  claimed: { label: "Claimed", className: "bg-purple-100 text-purple-700" },
  delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-600" },
};

export default function Dashboard() {
  const { hasAccess } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sensorsAvailable, setSensorsAvailable] = useState(false);

  const visibleQuickActions = QUICK_ACTIONS.filter((a) => hasAccess(a.pageKey));
  const visibleBusinessActions = BUSINESS_ACTIONS.filter((a) => !a.pageKey || hasAccess(a.pageKey)).filter(
    (a) => a.to !== "/settings/machine-status" || sensorsAvailable,
  );

  useEffect(() => {
    sensorServerAvailable().then(setSensorsAvailable);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [[orders]] = await Promise.all([
          select<{ c: number; loads: number }>("SELECT COUNT(*) as c, COALESCE(SUM(loads), 0) as loads FROM orders WHERE status != 'cancelled' AND date(drop_off_at, 'localtime') = date('now', 'localtime')"),
        ]);
        const [[customers]] = await Promise.all([select<{ c: number }>("SELECT COUNT(*) as c FROM customers")]);
        const [[lowStock]] = await Promise.all([
          select<{ c: number }>("SELECT COUNT(*) as c FROM inventory_items WHERE is_active = 1 AND quantity_on_hand <= reorder_level"),
        ]);
        const [[todaySales]] = await Promise.all([
          select<{ total: number | null }>(
            "SELECT SUM(grand_total) as total FROM orders WHERE status != 'cancelled' AND date(drop_off_at, 'localtime') = date('now', 'localtime')",
          ),
        ]);
        const [[yesterdaySales]] = await Promise.all([
          select<{ total: number | null }>(
            "SELECT SUM(grand_total) as total FROM orders WHERE status != 'cancelled' AND date(drop_off_at, 'localtime') = date('now', 'localtime', '-1 day')",
          ),
        ]);
        const [[expensesToday]] = await Promise.all([
          select<{ total: number | null }>(
            "SELECT SUM(amount) as total FROM expenses WHERE date(expense_date, 'localtime') = date('now', 'localtime')",
          ),
        ]);
        setCounts({
          orders: orders?.c ?? 0,
          loads: orders?.loads ?? 0,
          customers: customers?.c ?? 0,
          lowStock: lowStock?.c ?? 0,
          todaySales: todaySales?.total ?? 0,
          yesterdaySales: yesterdaySales?.total ?? 0,
          expensesToday: expensesToday?.total ?? 0,
        });

        const recent = await select<RecentOrder>(
          `SELECT o.id, o.status, o.grand_total, o.drop_off_at, c.full_name AS customer_name,
                  COALESCE(sp.name, (SELECT oi.description FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1)) AS item_label
           FROM orders o
           LEFT JOIN customers c ON c.id = o.customer_id
           LEFT JOIN service_packages sp ON sp.id = o.package_id
           ORDER BY o.drop_off_at DESC
           LIMIT 3`,
        );
        setRecentOrders(recent);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  let salesChangeLabel: string | null = null;
  let salesChangeUp = true;
  if (counts) {
    if (counts.yesterdaySales > 0) {
      const pct = ((counts.todaySales - counts.yesterdaySales) / counts.yesterdaySales) * 100;
      salesChangeUp = pct >= 0;
      salesChangeLabel = `${Math.abs(pct).toFixed(0)}%`;
    } else if (counts.todaySales > 0) {
      salesChangeUp = true;
      salesChangeLabel = "New";
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">Failed to load: {error}</p>}

      <div>
        <p className="text-xl font-bold text-ink">{greeting()} 👋</p>
        <p className="mt-0.5 text-sm text-ink/50">Here's your laundry today.</p>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-sm">
        <WashingMachine
          size={100}
          strokeWidth={1.2}
          aria-hidden="true"
          className="pointer-events-none absolute -right-4 -bottom-5 text-white/10"
        />
        <div className="relative">
          <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <Coins size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <p className="text-sm text-white/70">Today's Sales</p>
          <p className="mt-1 text-3xl font-bold">{counts ? `₱${counts.todaySales.toFixed(2)}` : "…"}</p>
          {salesChangeLabel && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-white/60">vs yesterday</span>
              <span
                className={
                  "flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold " +
                  (salesChangeUp ? "bg-emerald-400/25 text-emerald-100" : "bg-red-400/25 text-red-100")
                }
              >
                {salesChangeUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                {salesChangeLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatCard
          icon={Receipt}
          iconClassName="bg-blue-100 text-blue-600"
          value={counts?.orders ?? "…"}
          label="Orders"
          subLabel={counts ? `Today · ${counts.loads} load${counts.loads === 1 ? "" : "s"}` : "Today"}
          subLabelClassName="text-blue-600"
        />
        <StatCard
          icon={Users}
          iconClassName="bg-emerald-100 text-emerald-600"
          value={counts?.customers ?? "…"}
          label="Customers"
          subLabel="Total"
          subLabelClassName="text-emerald-600"
        />
        <StatCard
          icon={Package}
          iconClassName="bg-amber-100 text-amber-600"
          value={counts?.lowStock ?? "…"}
          label="Low stock"
          subLabel="Items"
          subLabelClassName="text-amber-600"
          to="/inventory?low=1"
        />
        <StatCard
          icon={Wallet}
          iconClassName="bg-red-100 text-red-600"
          value={counts ? `₱${counts.expensesToday.toFixed(2)}` : "…"}
          label="Expenses"
          subLabel="Today"
          subLabelClassName="text-red-600"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Quick actions</p>
        <div className="grid grid-cols-3 gap-3">
          <Link
            to="/sales/new"
            className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 py-6 text-white shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Plus size={20} strokeWidth={2.4} />
            </span>
            <span className="text-xs font-semibold">New order</span>
          </Link>
          {visibleQuickActions.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-surface py-6 text-center shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-200/40 text-brand-600">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="px-1 text-xs font-semibold text-ink">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Business</p>
        <div className="grid grid-cols-5 gap-x-2 gap-y-3">
          {visibleBusinessActions.map(({ to, label, icon: Icon, iconClassName }) => (
            <Link key={to} to={to} className="group flex flex-col items-center gap-1.5">
              <span
                className={
                  "flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-150 group-hover:scale-105 group-hover:text-white group-hover:shadow-md " +
                  iconClassName
                }
              >
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="text-center text-[10px] font-medium text-ink/70 transition-colors group-hover:text-ink">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Recent orders</p>
          <Link to="/sales" className="flex items-center gap-0.5 text-xs font-semibold text-brand-500">
            View all
            <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentOrders.map((o) => (
              <RecentOrderRow key={o.id} order={o} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecentOrderRow({ order }: { order: RecentOrder }) {
  const meta = STATUS_META[order.status];
  return (
    <li>
      <Link
        to={`/sales/${order.id}`}
        className="flex items-center gap-2.5 rounded-xl bg-surface p-2.5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-200/50 text-brand-600">
          <Receipt size={14} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{order.customer_name ?? "Walk-in"}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-[11px] text-ink/50">
              {order.item_label ?? "Order"} · {formatTime(order.drop_off_at)}
            </span>
            <span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + meta.className}>
              {meta.label}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="text-xs font-semibold text-ink">₱{order.grand_total.toFixed(2)}</span>
          <ChevronRight size={14} className="text-ink/20" />
        </div>
      </Link>
    </li>
  );
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  subLabel,
  subLabelClassName,
  value,
  to,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  iconClassName: string;
  label: string;
  subLabel: string;
  subLabelClassName: string;
  value: string | number;
  to?: string;
}) {
  const content = (
    <>
      <span className={"mb-2 flex h-7 w-7 items-center justify-center rounded-lg " + iconClassName}>
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <p className="truncate text-lg font-bold text-ink">{value}</p>
      <p className="truncate text-[11px] text-ink/50">{label}</p>
      <p className={"truncate text-[10px] font-semibold " + subLabelClassName}>{subLabel}</p>
    </>
  );

  const className = "block rounded-2xl bg-surface p-3 shadow-sm";

  if (to) {
    return (
      <Link
        to={to}
        className={
          className + " transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        }
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
