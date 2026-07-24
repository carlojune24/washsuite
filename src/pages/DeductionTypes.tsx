import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, PlusCircle, ShieldCheck } from "lucide-react";
import { select } from "../lib/db";
import type { DeductionType } from "../types";
import ListRow, { EmptyState } from "../components/ListRow";

export default function DeductionTypes() {
  const [types, setTypes] = useState<DeductionType[]>([]);

  useEffect(() => {
    select<DeductionType>("SELECT * FROM deduction_types WHERE is_active = 1 ORDER BY name").then(setTypes);
  }, []);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/deductions"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">Deduction Types</h1>
          <p className="truncate text-xs text-ink/50">SSS, PhilHealth, Pag-IBIG, or any custom deduction.</p>
        </div>
        <Link
          to="/deduction-types/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add deduction type"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
        </Link>
      </div>

      {types.length === 0 && <EmptyState text="No deduction types yet." />}

      <ul className="space-y-2">
        {types.map((t) => (
          <ListRow
            key={t.id}
            to={`/deduction-types/${t.id}/edit`}
            icon={ShieldCheck}
            title={t.name}
            subtitle={`EE ₱${t.employee_share.toFixed(2)} · ER ₱${t.employer_share.toFixed(2)}`}
            value={`₱${(t.employee_share + t.employer_share).toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
