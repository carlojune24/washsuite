import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Plus } from "lucide-react";
import { select } from "../lib/db";
import type { ServicePackage } from "../types";
import { EmptyState, PageHeading } from "../components/ListRow";

export default function ServicePackages() {
  const [packages, setPackages] = useState<ServicePackage[]>([]);

  useEffect(() => {
    select<ServicePackage>("SELECT * FROM service_packages WHERE is_active = 1 ORDER BY name").then(setPackages);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Service Packages" hint="Bundles customers can pick at checkout." />
        <Link
          to="/packages/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add package"
        >
          <Plus size={18} strokeWidth={2.2} />
        </Link>
      </div>

      {packages.length === 0 && <EmptyState text="No service packages yet." />}

      <ul className="space-y-2">
        {packages.map((p) => (
          <li key={p.id}>
            <Link to={`/packages/${p.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm">
              {p.image ? (
                <img src={p.image} alt={p.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
                  <Layers size={19} strokeWidth={2} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                <p className="truncate text-xs text-ink/50">{p.description || "No description"}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink">₱{p.price.toFixed(2)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
