import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ShoppingBasket, Zap, PackagePlus, User, Landmark, ArrowLeftRight, Wallet, TrendingUp } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import type { CashflowEntry } from "../types";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

const SOURCE_META: Record<CashflowEntry["source"], { label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  sale: { label: "Sale", icon: ShoppingBasket },
  expense: { label: "Expense", icon: Zap },
  restock: { label: "Restock", icon: PackagePlus },
  payroll: { label: "Payroll", icon: User },
  government: { label: "Government Remittance", icon: Landmark },
  adjustment: { label: "Adjustment", icon: ArrowLeftRight },
};

interface SourceEntryRow {
  source: CashflowEntry["source"];
  entry_type: "income" | "expense";
  total: number;
  count: number;
}

interface SourceSummary {
  source: CashflowEntry["source"];
  income: number;
  expense: number;
  net: number;
  count: number;
}

export default function ReportCashflowSource() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<SourceEntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (range) {
      conditions.push("substr(entry_date,1,10) >= ?", "substr(entry_date,1,10) <= ?");
      params.push(range.from, range.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    setLoading(true);
    select<SourceEntryRow>(
      `SELECT source, entry_type, SUM(amount) AS total, COUNT(*) AS count
       FROM cashflow_entries
       ${where}
       GROUP BY source, entry_type`,
      params,
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  const summaries = useMemo<SourceSummary[]>(() => {
    const bySource = new Map<CashflowEntry["source"], SourceSummary>();
    for (const r of rows) {
      const existing = bySource.get(r.source) ?? { source: r.source, income: 0, expense: 0, net: 0, count: 0 };
      if (r.entry_type === "income") existing.income += r.total;
      else existing.expense += r.total;
      existing.count += r.count;
      existing.net = existing.income - existing.expense;
      bySource.set(r.source, existing);
    }
    return [...bySource.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [rows]);

  const netTotal = summaries.reduce((s, r) => s + r.net, 0);
  const grossIncome = summaries.reduce((s, r) => s + r.income, 0);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Cashflow by source</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <TrendingUp size={15} strokeWidth={2.2} />
          </span>
          <p className="text-2xl font-semibold text-ink">₱{grossIncome.toFixed(2)}</p>
          <p className="text-xs text-ink/50">Gross income</p>
        </div>
        <div
          className={
            "rounded-2xl bg-gradient-to-br p-4 text-white shadow-sm " +
            (netTotal < 0 ? "from-red-600 to-red-500" : "from-brand-600 to-brand-500")
          }
        >
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
            <Wallet size={15} strokeWidth={2.2} />
          </span>
          <p className="text-2xl font-semibold">
            {netTotal < 0 ? "-" : ""}₱{Math.abs(netTotal).toFixed(2)}
          </p>
          <p className="text-xs text-white/70">Net for this period</p>
        </div>
      </div>

      {!loading && summaries.length === 0 && <EmptyState text="No cashflow entries in this period." />}

      <ul className="space-y-2">
        {summaries.map((s) => {
          const meta = SOURCE_META[s.source];
          return (
            <ListRow
              key={s.source}
              icon={meta.icon}
              title={meta.label}
              subtitle={`${s.count} entr${s.count === 1 ? "y" : "ies"} · in ₱${s.income.toFixed(2)} · out ₱${s.expense.toFixed(2)}`}
              value={`${s.net < 0 ? "-" : "+"}₱${Math.abs(s.net).toFixed(2)}`}
              valueClassName={s.net < 0 ? "text-red-500" : "text-emerald-600"}
            />
          );
        })}
      </ul>
    </div>
  );
}
