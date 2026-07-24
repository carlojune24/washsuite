import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, Tag } from "lucide-react";
import { select } from "../lib/db";
import type { Promo } from "../types";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

export default function Promos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [filter, setFilter] = useState<"active" | "inactive">("active");

  useEffect(() => {
    select<Promo>("SELECT * FROM promos ORDER BY created_at DESC").then(setPromos);
  }, []);

  const filtered = useMemo(
    () => promos.filter((p) => (filter === "active" ? p.is_active === 1 : p.is_active === 0)),
    [promos, filter],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Promos" hint="Discounts customers can apply at checkout." />
        <Link
          to="/promos/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add promo"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mb-3 flex gap-2">
        {(["active", "inactive"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
              (filter === f ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
            }
          >
            {f === "active" ? "Active" : "Inactive"}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState text={filter === "active" ? "No active promos." : "No inactive promos."} />
      )}

      <ul className="space-y-2">
        {filtered.map((p) => (
          <ListRow
            key={p.id}
            to={`/promos/${p.id}/edit`}
            icon={Tag}
            iconClassName={p.is_active ? undefined : "bg-brand-900/10 text-ink/40"}
            title={p.name}
            subtitle={p.code ?? "No code"}
            value={p.discount_type === "percent" ? `${p.discount_value}%` : `₱${p.discount_value.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
