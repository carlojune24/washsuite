import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Landmark } from "lucide-react";
import { select } from "../lib/db";
import ListRow, { EmptyState } from "../components/ListRow";

interface TypeRow {
  deduction_type_id: number;
  name: string;
  ee_total: number;
  er_total: number;
  count: number;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
}

export default function ReportGovernmentDeductions() {
  const [month, setMonth] = useState(currentPeriod());
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    select<TypeRow>(
      `SELECT dt.id AS deduction_type_id, dt.name,
              SUM(dpi.employee_share) AS ee_total, SUM(dpi.employer_share) AS er_total,
              COUNT(*) AS count
       FROM deduction_payment_items dpi
       JOIN deduction_payments dp ON dp.id = dpi.payment_id
       JOIN deduction_types dt ON dt.id = dpi.deduction_type_id
       WHERE dp.status = 'paid' AND dp.period = ?
       GROUP BY dt.id
       ORDER BY (ee_total + er_total) DESC`,
      [month],
    ).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [month]);

  const totals = rows.reduce(
    (acc, r) => ({ ee: acc.ee + r.ee_total, er: acc.er + r.er_total }),
    { ee: 0, er: 0 },
  );

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Government deductions</h1>
      </div>

      <label className="mb-4 block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <span className="mb-0.5 block text-[10px] font-medium text-ink/40">Period</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full text-sm text-ink outline-none"
        />
      </label>

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
          <Landmark size={15} strokeWidth={2.2} />
        </span>
        <p className="text-2xl font-semibold">₱{(totals.ee + totals.er).toFixed(2)}</p>
        <p className="text-xs text-white/70">
          EE ₱{totals.ee.toFixed(2)} · ER ₱{totals.er.toFixed(2)} remitted in {periodLabel(month)}
        </p>
      </div>

      {!loading && rows.length === 0 && (
        <EmptyState text="No remitted deductions in this month. Only payments marked paid on the Deductions page are counted." />
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <ListRow
            key={r.deduction_type_id}
            icon={Landmark}
            title={r.name}
            subtitle={`EE ₱${r.ee_total.toFixed(2)} · ER ₱${r.er_total.toFixed(2)} · ${r.count} payment${r.count === 1 ? "" : "s"}`}
            value={`₱${(r.ee_total + r.er_total).toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
