import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  FileDown,
  Coins,
  ShoppingBag,
  PackageCheck,
  AlertCircle,
  ChevronRight,
  User,
  Banknote,
  Smartphone,
  CreditCard,
  Landmark,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { select, formatDateTime } from "../lib/db";
import type { Order, OrderStatus, PaymentMethod } from "../types";
import { type Period, periodRange } from "../lib/period";
import { EmptyState } from "../components/ListRow";
import PeriodFilter from "../components/PeriodFilter";
import { generateSalesReportPdf } from "../lib/salesReport";
import { formatInvoiceNumber } from "../lib/invoice";

const STATUS_STAGES: OrderStatus[] = ["pending", "ready", "claimed", "delivered"];
const STAGE_LABEL: Record<OrderStatus, string> = {
  pending: "Received",
  ready: "Ready",
  claimed: "Claimed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const METHOD_META: Record<PaymentMethod, { label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; className: string }> = {
  cash: { label: "Cash", icon: Banknote, className: "bg-gray-100 text-gray-700" },
  gcash: { label: "GCash", icon: Smartphone, className: "bg-blue-100 text-blue-700" },
  card: { label: "Card", icon: CreditCard, className: "bg-purple-100 text-purple-700" },
  bank_transfer: { label: "Bank Transfer", icon: Landmark, className: "bg-emerald-100 text-emerald-700" },
};

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

type StatusFilter = "all" | "paid" | "ready" | "unpaid";

interface OrderRow extends Order {
  customer_name: string | null;
  customer_phone: string | null;
  item_label: string | null;
  payment_method: PaymentMethod | null;
}

export default function Sales() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    select<OrderRow>(
      `SELECT o.*, c.full_name AS customer_name, c.phone AS customer_phone,
              COALESCE(sp.name, (SELECT oi.description FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1)) AS item_label,
              (SELECT p.method FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_method
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN service_packages sp ON sp.id = o.package_id
       ORDER BY o.drop_off_at DESC
       LIMIT 200`,
    ).then(setOrders);
  }, []);

  const inPeriod = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) return orders;
    return orders.filter((o) => {
      const d = o.drop_off_at.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [orders, period, customFrom, customTo]);

  const stats = useMemo(() => {
    const paid = inPeriod.filter((o) => o.payment_status === "paid");
    const ready = inPeriod.filter((o) => o.status === "ready");
    const unpaid = inPeriod.filter((o) => o.payment_status === "unpaid");
    const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + o.grand_total, 0);
    return {
      total: sum(inPeriod),
      count: inPeriod.length,
      paidCount: paid.length,
      paidSum: sum(paid),
      readyCount: ready.length,
      readySum: sum(ready),
      unpaidCount: unpaid.length,
      unpaidSum: sum(unpaid),
      totalLoads: inPeriod.reduce((s, o) => s + (o.loads ?? 0), 0),
      totalKg: inPeriod.reduce((s, o) => s + (o.kg ?? 0), 0),
    };
  }, [inPeriod]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = inPeriod.filter((o) => {
      if (q) {
        const matchesCustomer = (o.customer_name ?? "walk-in").toLowerCase().includes(q);
        const matchesOrderNumber = o.order_number.toLowerCase().includes(q);
        const matchesPhone = (o.customer_phone ?? "").toLowerCase().includes(q);
        if (!matchesCustomer && !matchesOrderNumber && !matchesPhone) return false;
      }
      if (statusFilter === "paid" && o.payment_status !== "paid") return false;
      if (statusFilter === "ready" && o.status !== "ready") return false;
      if (statusFilter === "unpaid" && o.payment_status !== "unpaid") return false;
      if (methodFilter !== "all" && o.payment_method !== methodFilter) return false;
      return true;
    });
    return rows.sort((a, b) =>
      sortOrder === "oldest"
        ? a.drop_off_at.localeCompare(b.drop_off_at)
        : b.drop_off_at.localeCompare(a.drop_off_at),
    );
  }, [inPeriod, searchQuery, statusFilter, methodFilter, sortOrder]);

  // Feeds the PDF export, deliberately derived from `filtered` (period + status + method +
  // search) rather than `inPeriod`/`stats` above, so the report's summary numbers always match
  // exactly the orders listed in it.
  const periodLabel = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    if (!range) return "All time";
    const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    const prefix = period === "today" ? "Today" : period === "week" ? "This Week" : period === "month" ? "This Month" : "Custom";
    return range.from === range.to ? `${prefix} (${fmt(range.from)})` : `${prefix} (${fmt(range.from)} – ${fmt(range.to)})`;
  }, [period, customFrom, customTo]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== "all") {
      parts.push(`Status: ${statusFilter === "paid" ? "Paid" : statusFilter === "ready" ? "Ready" : "Unpaid"}`);
    }
    if (methodFilter !== "all") parts.push(`Method: ${METHOD_META[methodFilter].label}`);
    if (searchQuery.trim()) parts.push(`Search: "${searchQuery.trim()}"`);
    return parts.length ? parts.join(" · ") : "All statuses & payment methods";
  }, [statusFilter, methodFilter, searchQuery]);

  const pdfStats = useMemo(() => {
    const paid = filtered.filter((o) => o.payment_status === "paid");
    const ready = filtered.filter((o) => o.status === "ready");
    const unpaid = filtered.filter((o) => o.payment_status === "unpaid");
    const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + o.grand_total, 0);
    return {
      total: sum(filtered),
      count: filtered.length,
      paidCount: paid.length,
      paidSum: sum(paid),
      readyCount: ready.length,
      readySum: sum(ready),
      unpaidCount: unpaid.length,
      unpaidSum: sum(unpaid),
      totalLoads: filtered.reduce((s, o) => s + (o.loads ?? 0), 0),
      totalKg: filtered.reduce((s, o) => s + (o.kg ?? 0), 0),
    };
  }, [filtered]);

  function handleExportPdf() {
    setExporting(true);
    try {
      generateSalesReportPdf({
        businessName: "WashSuite",
        periodLabel,
        filterLabel,
        totalSum: pdfStats.total,
        totalCount: pdfStats.count,
        paidCount: pdfStats.paidCount,
        paidSum: pdfStats.paidSum,
        readyCount: pdfStats.readyCount,
        readySum: pdfStats.readySum,
        unpaidCount: pdfStats.unpaidCount,
        unpaidSum: pdfStats.unpaidSum,
        totalLoads: pdfStats.totalLoads,
        totalKg: pdfStats.totalKg,
        rows: filtered.map((o) => ({
          order_number: o.order_number,
          drop_off_at: o.drop_off_at,
          customer_name: o.customer_name,
          item_label: o.item_label,
          status: o.status,
          payment_status: o.payment_status,
          payment_method: o.payment_method ? METHOD_META[o.payment_method].label : null,
          grand_total: o.grand_total,
        })),
      });
      toast.success("Sales report exported");
    } catch (err) {
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sales</h1>
          <p className="mt-0.5 text-xs text-ink/50">Orders, payments, and receipt printing.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex h-10 items-center gap-1.5 rounded-full border border-brand-500/30 bg-surface px-3.5 text-xs font-semibold text-brand-500 shadow-sm disabled:opacity-60"
          >
            <FileDown size={15} strokeWidth={2.2} />
            {exporting ? "Exporting…" : "Export PDF"}
          </button>

        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Coins size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{stats.total.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Total sales</p>
          <p className="truncate text-[8px] text-white/60">
            {stats.count} order{stats.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <ShoppingBag size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.paidCount}</p>
          <p className="truncate text-[9px] text-ink/50">Paid</p>
          <p className="truncate text-[8px] font-semibold text-emerald-600">₱{stats.paidSum.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <PackageCheck size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.readyCount}</p>
          <p className="truncate text-[9px] text-ink/50">Ready</p>
          <p className="truncate text-[8px] font-semibold text-blue-600">₱{stats.readySum.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <AlertCircle size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">{stats.unpaidCount}</p>
          <p className="truncate text-[9px] text-ink/50">Unpaid</p>
          <p className="truncate text-[8px] font-semibold text-red-600">₱{stats.unpaidSum.toFixed(2)}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
          <Layers size={14} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {stats.totalLoads} load{stats.totalLoads === 1 ? "" : "s"}
          </p>
          <p className="truncate text-[10px] text-ink/40">
            washed this period{stats.totalKg > 0 ? ` · ${stats.totalKg} kg` : ""}
          </p>
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customer, order no., or phone…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 flex gap-1.5">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {(
            [
              ["all", `All (${inPeriod.length})`, undefined],
              ["paid", `Paid (${stats.paidCount})`, "bg-emerald-500"],
              ["ready", `Ready (${stats.readyCount})`, "bg-blue-500"],
              ["unpaid", `Unpaid (${stats.unpaidCount})`, "bg-red-500"],
            ] as const
          ).map(([f, label, dot]) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
                (statusFilter === f ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
              }
            >
              {dot && <span className={"h-1.5 w-1.5 rounded-full " + dot} />}
              {label}
            </button>
          ))}
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | "all")}
          className="shrink-0 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-ink/60 shadow-sm outline-none"
        >
          <option value="all">All Payment Methods</option>
          {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_META[m].label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
          title={sortOrder === "newest" ? "Newest first (click for oldest first)" : "Oldest first (click for newest first)"}
          className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-ink/60 shadow-sm"
        >
          {sortOrder === "newest" ? (
            <ArrowDownWideNarrow size={14} strokeWidth={2.2} />
          ) : (
            <ArrowUpNarrowWide size={14} strokeWidth={2.2} />
          )}
        </button>
      </div>
      </div>

      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-28">
      {filtered.length === 0 && (
        <EmptyState text={orders.length === 0 ? "No orders yet." : "No orders match your filters."} />
      )}

      <ul className="space-y-2.5">
        {filtered.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </ul>
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const unpaid = order.payment_status !== "paid";
  const name = order.customer_name ?? "Walk-in";
  const method = order.payment_method ? METHOD_META[order.payment_method] : null;

  return (
    <li>
      <Link to={`/sales/${order.id}`} className="block rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="flex items-start gap-3">
          {order.customer_name ? (
            <span
              className={
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                avatarColor(order.customer_name)
              }
            >
              {initials(order.customer_name)}
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-200/50 text-brand-600">
              <User size={17} strokeWidth={2.2} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              {order.item_label && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  {order.item_label}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink/40">
              {order.order_number} · {formatDateTime(order.drop_off_at)}
              {order.invoice_number != null && ` · INV #${formatInvoiceNumber(order.invoice_number)}`}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className={"text-sm font-semibold " + (unpaid ? "text-red-600" : "text-ink")}>
              ₱{order.grand_total.toFixed(2)}
            </p>
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-ink/20" />
        </div>

        <div className="mt-3">
          <OrderStepper status={order.status} unpaid={unpaid} />
        </div>

        {method && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className={"flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " + method.className}>
              <method.icon size={11} strokeWidth={2.4} />
              {method.label}
            </span>
          </div>
        )}
      </Link>
    </li>
  );
}

function OrderStepper({ status, unpaid }: { status: OrderStatus; unpaid: boolean }) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-600">
        Cancelled
      </span>
    );
  }

  const currentIndex = STATUS_STAGES.indexOf(status);

  return (
    <div className="flex items-center">
      {STATUS_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  "h-2.5 w-2.5 rounded-full border-2 " +
                  (done
                    ? "border-emerald-500 bg-emerald-500"
                    : current
                      ? unpaid
                        ? "border-red-500 bg-surface"
                        : "border-brand-500 bg-surface"
                      : "border-gray-200 bg-surface")
                }
              />
              <span
                className={
                  "text-[9px] font-medium whitespace-nowrap " +
                  (current
                    ? unpaid
                      ? "text-red-600"
                      : "text-brand-500"
                    : done
                      ? "text-emerald-600"
                      : "text-ink/30")
                }
              >
                {STAGE_LABEL[stage]}
              </span>
            </div>
            {i < STATUS_STAGES.length - 1 && (
              <div className={"mx-1 h-0.5 flex-1 " + (i < currentIndex ? "bg-emerald-500" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
