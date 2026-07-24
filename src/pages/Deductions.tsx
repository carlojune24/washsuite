import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Wallet, Landmark, User, Search, Settings2 } from "lucide-react";
import { select } from "../lib/db";
import type { Worker, DeductionType, WorkerDeduction } from "../types";
import { EmptyState, PageHeading } from "../components/ListRow";

interface PaymentRow {
  worker_id: number;
  status: "pending" | "paid";
}

type StatusFilter = "all" | "paid" | "pending" | "not_set";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
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

export default function Deductions() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [types, setTypes] = useState<DeductionType[]>([]);
  const [assignments, setAssignments] = useState<WorkerDeduction[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    select<Worker>("SELECT * FROM workers WHERE is_active = 1 ORDER BY full_name").then(setWorkers);
    select<DeductionType>("SELECT * FROM deduction_types WHERE is_active = 1 ORDER BY name").then(setTypes);
    select<WorkerDeduction>("SELECT * FROM worker_deductions WHERE is_active = 1").then(setAssignments);
  }, []);

  useEffect(() => {
    select<PaymentRow>("SELECT worker_id, status FROM deduction_payments WHERE period = ?", [period]).then(
      setPayments,
    );
  }, [period]);

  // worker_id -> deduction_type_id -> { ee, er }, so the table can render one column per active
  // deduction type dynamically — adding a 4th type later just adds a 4th column, no code change.
  const matrix = useMemo(() => {
    const m = new Map<number, Map<number, { ee: number; er: number }>>();
    for (const a of assignments) {
      if (!m.has(a.worker_id)) m.set(a.worker_id, new Map());
      m.get(a.worker_id)!.set(a.deduction_type_id, { ee: a.employee_share, er: a.employer_share });
    }
    return m;
  }, [assignments]);

  const rows = useMemo(() => {
    return workers.map((w) => {
      const perType = matrix.get(w.id);
      const payment = payments.find((p) => p.worker_id === w.id);
      const eeTotal = perType ? [...perType.values()].reduce((s, v) => s + v.ee, 0) : 0;
      const erTotal = perType ? [...perType.values()].reduce((s, v) => s + v.er, 0) : 0;
      const status: "paid" | "pending" | "not_set" =
        eeTotal === 0 && erTotal === 0 ? "not_set" : payment?.status === "paid" ? "paid" : "pending";
      return { worker: w, perType, eeTotal, erTotal, status };
    });
  }, [workers, matrix, payments]);

  const stats = useMemo(() => {
    const configured = rows.filter((r) => r.status !== "not_set");
    const totalEE = configured.reduce((s, r) => s + r.eeTotal, 0);
    const totalER = configured.reduce((s, r) => s + r.erTotal, 0);
    return { count: configured.length, totalEE, totalER };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.worker.full_name.toLowerCase().includes(q) && !(r.worker.position ?? "").toLowerCase().includes(q))
        return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Deductions" hint="Government mandatory deductions per employee." />
        <Link
          to="/deduction-types"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
          aria-label="Manage deduction types"
        >
          <Settings2 size={17} strokeWidth={2.2} />
        </Link>
      </div>

      <label className="mb-4 block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Period</span>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-full text-sm text-ink outline-none"
        />
      </label>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-2.5 text-white shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
            <Wallet size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold">₱{(stats.totalEE + stats.totalER).toFixed(2)}</p>
          <p className="truncate text-[9px] text-white/70">Total Deductions</p>
          <p className="truncate text-[8px] text-white/60">
            {stats.count} employee{stats.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Landmark size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{stats.totalER.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Employer Share</p>
          <p className="truncate text-[8px] font-semibold text-emerald-600">{periodLabel(period)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-2.5 shadow-sm">
          <span className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <User size={12} strokeWidth={2.2} />
          </span>
          <p className="truncate text-lg font-bold text-ink">₱{stats.totalEE.toFixed(2)}</p>
          <p className="truncate text-[9px] text-ink/50">Employee Share</p>
          <p className="truncate text-[8px] font-semibold text-purple-600">{periodLabel(period)}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1.5">
        <label className="flex flex-1 items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
          <Search size={16} strokeWidth={2.2} className="text-ink/30" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee…"
            className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="shrink-0 rounded-2xl bg-surface px-3 text-xs font-semibold text-ink/60 shadow-sm outline-none"
        >
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="not_set">Not Set</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={workers.length === 0 ? "No active workers." : "No workers match your filters."} />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] font-semibold tracking-wide text-ink/40 uppercase">
                <th className="px-3.5 py-3 font-semibold">Employee</th>
                {types.map((t) => (
                  <th key={t.id} className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                    {t.name}
                    <br />
                    <span className="text-[9px] font-normal normal-case text-ink/30">EE / ER</span>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Total</th>
                <th className="px-3.5 py-3 text-right font-semibold whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.worker.id}
                  onClick={() => navigate(`/deductions/${r.worker.id}?period=${period}`)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-surface-muted"
                >
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                          avatarColor(r.worker.full_name)
                        }
                      >
                        {r.worker.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{r.worker.full_name}</p>
                        <p className="truncate text-xs text-ink/40">{r.worker.position ?? "No position"}</p>
                      </div>
                    </div>
                  </td>
                  {types.map((t) => {
                    const cell = r.perType?.get(t.id);
                    return (
                      <td key={t.id} className="px-3 py-3 text-right whitespace-nowrap">
                        {cell ? (
                          <>
                            <p className="font-medium text-ink">₱{cell.ee.toFixed(2)}</p>
                            <p className="text-xs text-ink/35">₱{cell.er.toFixed(2)}</p>
                          </>
                        ) : (
                          <span className="text-ink/20">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-ink">
                    ₱{r.eeTotal.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-3 text-right whitespace-nowrap">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (r.status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500")
                      }
                    >
                      {r.status === "paid" ? "Paid" : r.status === "pending" ? "Pending" : "Not Set"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
