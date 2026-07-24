import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, Sparkles } from "lucide-react";
import { select } from "../lib/db";
import type { AddOn } from "../types";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

export default function AddOns() {
  const [addOns, setAddOns] = useState<AddOn[]>([]);

  useEffect(() => {
    select<AddOn>("SELECT * FROM add_ons WHERE is_active = 1 ORDER BY name").then(setAddOns);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Add-ons" hint="Extra services customers can add to any order." />
        <Link
          to="/addons/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add add-on"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
        </Link>
      </div>

      {addOns.length === 0 && <EmptyState text="No add-ons yet." />}

      <ul className="space-y-2">
        {addOns.map((a) => (
          <ListRow
            key={a.id}
            to={`/addons/${a.id}/edit`}
            icon={Sparkles}
            title={a.name}
            value={`+₱${a.price.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
