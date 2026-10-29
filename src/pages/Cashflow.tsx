import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  TrendingUp,
  Plus,
  ArrowUp,
  ArrowDown,
  Wallet,
  Landmark,
  ShoppingBasket,
  Zap,
  User,
  ArrowLeftRight,
  PackagePlus,
  Clock,
  PieChart,
  Banknote,
  Smartphone,
  CreditCard,
  FileDown,
} from "lucide-react";
import { select, formatTime, utcToLocalDate } from "../lib/db";
import type { Branch, CashflowEntry, PaymentStatus, PaymentMethod } from "../types";
import { EmptyState } from "../components/ListRow";
import { generateCashflowReportPdf } from "../lib/cashflowReport";
import { formatInvoiceNumber } from "../lib/invoice";
import { localDate } from "../lib/localDate";

type PeriodFilter = "month" | "range";
type CategoryFilter = "all" | "income" | "expense" | "restock" | "payroll" | "government" | "adjustment";

interface CashflowRow extends CashflowEntry {
  order_payment_status: PaymentStatus | null;
  order_invoice_number: number | null;
}

interface Row extends CashflowRow {
  receivable: boolean;
  balance: number;
}

const SOURCE_META: Record<
  CashflowEntry["source"],
  { label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }
> = {
  sale: { label: "Sale", icon: ShoppingBasket },
  expense: { label: "Expense", icon: Zap },
  restock: { label: "Restock", icon: PackagePlus },
  payroll: { label: "Payroll", icon: User },
  government: { label: "Government Remittance", icon: Landmark },
  adjustment: { label: "Adjustment", icon: ArrowLeftRight },
};

const METHOD_META: Record<PaymentMethod, { label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; className: string }> = {
  cash: { label: "Cash", icon: Banknote, className: "bg-gray-100 text-gray-700" },
  gcash: { label: "E-wallet", icon: Smartphone, className: "bg-blue-100 text-blue-700" },
  card: { label: "Card", icon: CreditCard, className: "bg-purple-100 text-purple-700" },
  bank_transfer: { label: "Bank Transfer", icon: Landmark, className: "bg-emerald-100 text-emerald-700" },
};

const CATEGORY_PILLS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expense", label: "Expenses" },
  { key: "restock", label: "Restock" },
  { key: "payroll", label: "Payroll" },
  { key: "government", label: "Government" },
  { key: "adjustment", label: "Adjustments" },
];

function toISODate(d: Date) {
  return localDate(d);
}

function currentMonth() {
  return localDate(new Date()).slice(0, 7);
}

function prevMonthOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? null : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function dayLabel(dateStr: string) {
  const today = localDate(new Date());
  const yesterday = localDate(new Date(Date.now() - 86400000));
  if (dateStr === today) return `Today · ${new Date(dateStr).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`;
  if (dateStr === yesterday) return `Yesterday · ${new Date(dateStr).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`;
  return new Date(dateStr).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export default function Cashflow() {
  const [entries, setEntries] = useState<CashflowRow[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [month, setMonth] = useState(currentMonth());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "all">("all");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [periodLoads, setPeriodLoads] = useState({ loads: 0, kg: 0, orderCount: 0 });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    select<CashflowRow>(
      `SELECT e.*, o.payment_status AS order_payment_status, o.invoice_number AS order_invoice_number
       FROM cashflow_entries e
       LEFT JOIN orders o ON e.source = 'sale' AND e.source_id = o.id
       ORDER BY e.entry_date ASC`,
    ).then(setEntries);
    select<Branch>("SELECT * FROM branches WHERE id = 1").then(([b]) => setBranch(b ?? null));
  }, []);

  // Loads/kg are order attributes, not cashflow entries, so they need their own query bounded
  // by the same date window as the cashflow filter above — this is what lets the PDF answer
  // "how many loads this period" alongside the money figures.
  useEffect(() => {
    let from: string | null = null;
    let to: string | null = null;
    if (period === "month") {
      if (month) {
        const [y, m] = month.split("-").map(Number);
        from = `${month}-01`;
        to = toISODate(new Date(y, m, 0));
      }
    } else {
      from = dateFrom || null;
      to = dateTo || null;
    }
    const conditions: string[] = [];
    const params: string[] = [];
    if (from) {
      conditions.push("substr(drop_off_at,1,10) >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("substr(drop_off_at,1,10) <= ?");
      params.push(to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    select<{ loads: number | null; kg: number | null; order_count: number }>(
      `SELECT COALESCE(SUM(loads),0) AS loads, COALESCE(SUM(kg),0) AS kg, COUNT(*) AS order_count FROM orders ${where}`,
      params,
    ).then(([row]) => {
      setPeriodLoads({ loads: row?.loads ?? 0, kg: row?.kg ?? 0, orderCount: row?.order_count ?? 0 });
    });
  }, [period, month, dateFrom, dateTo]);

  // Running balance computed once, oldest-first, over ALL entries (not just the filtered period) —
  // "Balance" on a row means real cash-on-hand at that moment, which only makes sense computed
  // against the full history. Receivables don't move the balance since they aren't real cash yet.
  const withBalance = useMemo<Row[]>(() => {
    let running = 0;
    return entries.map((e) => {
      const receivable = e.source === "sale" && e.order_payment_status !== "paid";
      if (!receivable) running += e.entry_type === "income" ? e.amount : -e.amount;
      return { ...e, receivable, balance: running };
    });
  }, [entries]);

  const cashOnHand = withBalance.length > 0 ? withBalance[withBalance.length - 1].balance : 0;

  const cashBreakdown = useMemo(() => {
    const byMethod: Record<PaymentMethod, number> = { cash: 0, gcash: 0, card: 0, bank_transfer: 0 };
    for (const r of withBalance) {
      if (r.receivable || !r.method) continue;
      byMethod[r.method] += r.entry_type === "income" ? r.amount : -r.amount;
    }
    return byMethod;
  }, [withBalance]);

  const inPeriod = useMemo(() => {
    return withBalance.filter((r) => {
      const d = utcToLocalDate(r.entry_date);
      if (period === "month") return month ? d.slice(0, 7) === month : true;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [withBalance, period, month, dateFrom, dateTo]);

  // "Hide un-invoiced sales" (Settings → Business Info) scrubs sale entries for orders with no
  // invoice number from every audit-facing number below -- summary cards, the itemized list, and
  // the PDF export (which derives from `filtered`). cashOnHand/cashBreakdown above are deliberately
  // NOT filtered -- that's real cash the shop must keep tracking accurately regardless of this
  // display setting.
  const isHiddenUninvoiced = (r: Row) =>
    !!branch?.hide_uninvoiced_sales_in_cashflow && r.source === "sale" && !r.order_invoice_number;

  const visible = useMemo(() => inPeriod.filter((r) => !isHiddenUninvoiced(r)), [inPeriod, branch]);

  const stats = useMemo(() => {
    // Owner capital injections / withdrawals ("adjustment") move cash but aren't business income or
    // expense, so they stay out of these cards (cash on hand and the running balance still count them).
    const income = visible.filter((r) => r.entry_type === "income" && !r.receivable && r.source !== "adjustment");
    const expense = visible.filter((r) => r.entry_type === "expense" && r.source !== "adjustment");
    const incomeSum = income.reduce((s, r) => s + r.amount, 0);
    const expenseSum = expense.reduce((s, r) => s + r.amount, 0);
    return { incomeSum, incomeCount: income.length, expenseSum, expenseCount: expense.length, net: incomeSum - expenseSum };
  }, [visible]);

  const prevStats = useMemo(() => {
    if (period !== "month") return null;
    const prev = prevMonthOf(month);
    const rows = withBalance.filter((r) => utcToLocalDate(r.entry_date).slice(0, 7) === prev && !isHiddenUninvoiced(r));
    const incomeSum = rows.filter((r) => r.entry_type === "income" && !r.receivable && r.source !== "adjustment").reduce((s, r) => s + r.amount, 0);
    const expenseSum = rows.filter((r) => r.entry_type === "expense" && r.source !== "adjustment").reduce((s, r) => s + r.amount, 0);
    return { incomeSum, expenseSum, net: incomeSum - expenseSum };
  }, [withBalance, period, month, branch]);

  const filtered = useMemo(() => {
    return visible.filter((r) => {
      if (categoryFilter === "income" && !(r.entry_type === "income" && r.source !== "adjustment")) return false;
      if (categoryFilter === "expense" && r.source !== "expense") return false;
      if (categoryFilter === "restock" && r.source !== "restock") return false;
      if (categoryFilter === "payroll" && r.source !== "payroll") return false;
      if (categoryFilter === "government" && r.source !== "government") return false;
      if (categoryFilter === "adjustment" && r.source !== "adjustment") return false;
      if (methodFilter !== "all" && r.method !== methodFilter) return false;
      return true;
    });
  }, [visible, categoryFilter, methodFilter]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const r of filtered) {
      const d = utcToLocalDate(r.entry_date);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(r);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, rows]) => ({
        date,
        rows: rows.sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
        net: rows.filter((r) => !r.receivable).reduce((s, r) => s + (r.entry_type === "income" ? r.amount : -r.amount), 0),
      }));
  }, [filtered]);

  const incomeChange = prevStats ? pctChange(stats.incomeSum, prevStats.incomeSum) : null;
  const expenseChange = prevStats ? pctChange(stats.expenseSum, prevStats.expenseSum) : null;
  const netChange = prevStats ? pctChange(stats.net, prevStats.net) : null;

  // Everything below feeds the PDF export and is deliberately derived from `filtered` (period +
  // category + method) rather than `inPeriod`/`stats`, so the numbers in the report always match
  // exactly the transactions listed in it — never a total that includes rows the list doesn't show.
  const periodLabel = useMemo(() => {
    if (period === "month") {
      if (!month) return "All time";
      const [y, m] = month.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
    }
    const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `From ${fmt(dateFrom)}`;
    if (dateTo) return `Up to ${fmt(dateTo)}`;
    return "All time";
  }, [period, month, dateFrom, dateTo]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (categoryFilter !== "all") {
      const pill = CATEGORY_PILLS.find((p) => p.key === categoryFilter);
      parts.push(`Category: ${pill?.label ?? categoryFilter}`);
    }
    if (methodFilter !== "all") parts.push(`Method: ${METHOD_META[methodFilter].label}`);
    return parts.length ? parts.join(" · ") : "All categories & payment methods";
  }, [categoryFilter, methodFilter]);

  const pdfStats = useMemo(() => {
    const income = filtered.filter((r) => r.entry_type === "income" && !r.receivable && r.source !== "adjustment");
    const expense = filtered.filter((r) => r.entry_type === "expense" && r.source !== "adjustment");
    const pending = filtered.filter((r) => r.receivable);
    const incomeSum = income.reduce((s, r) => s + r.amount, 0);
    const expenseSum = expense.reduce((s, r) => s + r.amount, 0);
    return {
      incomeSum,
      incomeCount: income.length,
      expenseSum,
      expenseCount: expense.length,
      net: incomeSum - expenseSum,
      pendingSum: pending.reduce((s, r) => s + r.amount, 0),
      pendingCount: pending.length,
    };
  }, [filtered]);

  const pdfMethodBreakdown = useMemo(() => {
    const byMethod: Record<PaymentMethod, number> = { cash: 0, gcash: 0, card: 0, bank_transfer: 0 };
    for (const r of filtered) {
      if (r.receivable || !r.method) continue;
      byMethod[r.method] += r.entry_type === "income" ? r.amount : -r.amount;
    }
    return byMethod;
  }, [filtered]);

  function handleExportPdf() {
    setExporting(true);
    try {
      generateCashflowReportPdf({
        businessName: "WashSuite",
        branchName: branch?.name ?? null,
        branchAddress: branch?.address ?? null,
        periodLabel,
        filterLabel,
        incomeSum: pdfStats.incomeSum,
        incomeCount: pdfStats.incomeCount,
        expenseSum: pdfStats.expenseSum,
        expenseCount: pdfStats.expenseCount,
        net: pdfStats.net,
        pendingSum: pdfStats.pendingSum,
        pendingCount: pdfStats.pendingCount,
        methodBreakdown: pdfMethodBreakdown,
        loads: periodLoads.loads,
        kg: periodLoads.kg,
        orderCount: periodLoads.orderCount,
        entries: filtered,
      });
      toast.success("Cashflow report exported");
    } catch (err) {
      console.error("Cashflow PDF export failed:", err);
      toast.error(`Couldn't export PDF: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="md:flex md:h-full md:flex-col">
      <div className="md:shrink-0">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
            <TrendingUp size={17} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Cashflow</h1>
            <p className="mt-0.5 text-xs text-ink/50">Track your money in and out of your business.</p>
          </div>
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
          <Link
            to="/cashflow/new"
            className="flex h-10 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 text-xs font-semibold text-white shadow-sm"
          >
            <Plus size={15} strokeWidth={2.4} />
            Add Entry
          </Link>
        </div>
      </div>

      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <div className="flex flex-1 gap-1.5 rounded-2xl bg-surface p-1.5 shadow-sm">
          {(["month", "range"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPeriod(f)}
              className={
                "flex-1 rounded-xl py-1.5 text-xs font-semibold transition-colors " +
                (period === f ? "bg-brand-500 text-white" : "text-ink/50")
              }
            >
              {f === "month" ? "By Month" : "By Date Range"}
            </button>
          ))}
        </div>

        {period === "month" && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-36 shrink-0 rounded-2xl bg-surface px-3 py-2.5 text-sm text-ink shadow-sm outline-none"
          />
        )}
      </div>

      {period === "range" && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <TrendingUp size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold text-ink">₱{stats.incomeSum.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">
            Income · {stats.incomeCount} txn{stats.incomeCount === 1 ? "" : "s"}
          </p>
          {incomeChange != null && (
            <span
              className={
                "mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold " +
                (incomeChange >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")
              }
            >
              {incomeChange >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
              {Math.abs(incomeChange).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <ArrowDown size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold text-ink">₱{stats.expenseSum.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">
            Expenses · {stats.expenseCount} txn{stats.expenseCount === 1 ? "" : "s"}
          </p>
          {expenseChange != null && (
            <span
              className={
                "mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold " +
                (expenseChange >= 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700")
              }
            >
              {expenseChange >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
              {Math.abs(expenseChange).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className={"truncate text-sm font-bold " + (stats.net < 0 ? "text-red-600" : "text-ink")}>
            {stats.net < 0 ? "-" : ""}₱{Math.abs(stats.net).toFixed(2)}
          </p>
          <p className="truncate text-[9px] text-ink/50">Profit/Loss</p>
          {netChange != null && (
            <span
              className={
                "mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold " +
                (netChange >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")
              }
            >
              {netChange >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
              {Math.abs(netChange).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-sm font-bold">₱{cashOnHand.toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Cash on Hand</p>
          <p className="truncate text-[9px] text-white/60">As of today</p>
        </div>
      </div>

      <div className="mb-4 rounded-2xl bg-surface p-3.5 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5">
          <PieChart size={14} strokeWidth={2.2} className="text-brand-500" />
          <span className="text-xs font-semibold text-ink">Cash Breakdown</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
            const meta = METHOD_META[m];
            return (
              <div key={m} className="flex items-center gap-2">
                <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + meta.className}>
                  <meta.icon size={14} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink/50">{meta.label}</p>
                  <p className="truncate text-sm font-semibold text-ink">₱{cashBreakdown[m].toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-1.5">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {CATEGORY_PILLS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(key)}
              className={
                "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
                (categoryFilter === key ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | "all")}
          className="shrink-0 rounded-full bg-surface px-3 py-2 text-xs font-semibold text-ink/60 shadow-sm outline-none"
        >
          <option value="all">All Methods</option>
          {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_META[m].label}
            </option>
          ))}
        </select>
      </div>
      </div>

      <div className="pt-4 pb-28 md:-mx-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-4">
      {grouped.length === 0 && (
        <EmptyState text={entries.length === 0 ? "No cashflow entries yet." : "No cashflow entries match your filters."} />
      )}

      <div className="space-y-4">
        {grouped.map((day) => (
          <div key={day.date}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-ink">{dayLabel(day.date)}</span>
              <span className={"text-xs font-semibold " + (day.net < 0 ? "text-red-600" : "text-emerald-600")}>
                Net: {day.net < 0 ? "-" : "+"}₱{Math.abs(day.net).toFixed(2)}
              </span>
            </div>
            <ul className="space-y-2">
              {day.rows.map((r) => {
                const meta = SOURCE_META[r.source];
                const methodMeta = r.method ? METHOD_META[r.method] : null;
                const time = formatTime(r.entry_date);
                const rowContent = (
                  <>
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                        (r.receivable
                          ? "bg-gray-100 text-gray-400"
                          : r.entry_type === "income"
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-red-100 text-red-500")
                      }
                    >
                      {r.receivable ? <Clock size={17} strokeWidth={2.2} /> : <meta.icon size={17} strokeWidth={2.2} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={"truncate text-sm font-semibold " + (r.receivable ? "text-ink/40" : "text-ink")}>
                        {r.description || meta.label}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={"truncate text-xs " + (r.receivable ? "text-ink/30" : "text-ink/40")}>
                          {meta.label}
                          {r.receivable ? " · Unpaid" : ""} · {time}
                          {r.source === "sale" && r.order_invoice_number != null &&
                            ` · INV #${formatInvoiceNumber(r.order_invoice_number)}`}
                        </span>
                        {methodMeta && (
                          <span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + methodMeta.className}>
                            {methodMeta.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={
                          "text-sm font-semibold " +
                          (r.receivable ? "text-ink/30" : r.entry_type === "expense" ? "text-red-500" : "text-emerald-600")
                        }
                      >
                        {r.entry_type === "expense" ? "-" : "+"}₱{r.amount.toFixed(2)}
                      </p>
                      {!r.receivable && <p className="text-[10px] text-ink/30">Balance: ₱{r.balance.toFixed(2)}</p>}
                    </div>
                  </>
                );
                return (
                  <li key={r.id} className="rounded-2xl bg-surface shadow-sm">
                    {r.source === "adjustment" ? (
                      <Link to={`/cashflow/adjustments/${r.id}`} className="flex items-center gap-3 p-3.5">
                        {rowContent}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 p-3.5">{rowContent}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
