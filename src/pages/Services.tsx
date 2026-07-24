import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, WashingMachine } from "lucide-react";
import { select } from "../lib/db";
import type { ServiceType } from "../types";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

export default function Services() {
  const [services, setServices] = useState<ServiceType[]>([]);

  useEffect(() => {
    select<ServiceType>("SELECT * FROM service_types WHERE is_active = 1 ORDER BY name").then(setServices);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Services" hint="Wash & fold, dry clean, and other billable services." />
        <Link
          to="/services/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add service"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
        </Link>
      </div>

      {services.length === 0 && <EmptyState text="No services yet." />}

      <ul className="space-y-2">
        {services.map((s) => (
          <ListRow
            key={s.id}
            to={`/services/${s.id}/edit`}
            icon={WashingMachine}
            title={s.name}
            subtitle={`per ${s.unit}`}
            value={`₱${s.price.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
