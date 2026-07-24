import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Pencil, Layers, Sparkles } from "lucide-react";
import { select } from "../lib/db";
import type { ServicePackage } from "../types";
import { doseFallbackLabel } from "../lib/dose";
import { EmptyState } from "../components/ListRow";

interface ServiceRow {
  id: number;
  quantity: number;
  service_name: string;
  unit: string;
}

interface ItemRow {
  id: number;
  quantity: number;
  item_name: string;
  unit: string;
  dose_size: number;
  dose_label: string | null;
}

interface AddOnRow {
  id: number;
  name: string;
  price: number;
}

export default function ServicePackageDetail() {
  const { id } = useParams();
  const [pkg, setPkg] = useState<ServicePackage | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [addOns, setAddOns] = useState<AddOnRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      select<ServicePackage>("SELECT * FROM service_packages WHERE id = ?", [id]),
      select<ServiceRow>(
        `SELECT sps.id, sps.quantity, st.name AS service_name, st.unit
         FROM service_package_services sps
         JOIN service_types st ON st.id = sps.service_type_id
         WHERE sps.package_id = ?
         ORDER BY st.name`,
        [id],
      ),
      select<ItemRow>(
        `SELECT spi.id, spi.quantity, ii.name AS item_name, ii.unit, ii.dose_size, ii.dose_label
         FROM service_package_items spi
         JOIN inventory_items ii ON ii.id = spi.item_id
         WHERE spi.package_id = ?
         ORDER BY ii.name`,
        [id],
      ),
      select<AddOnRow>(
        `SELECT a.id, a.name, a.price
         FROM service_package_add_ons spa
         JOIN add_ons a ON a.id = spa.add_on_id
         WHERE spa.package_id = ?
         ORDER BY a.name`,
        [id],
      ),
    ]).then(([[p], sv, i, a]) => {
      setPkg(p ?? null);
      setServices(sv);
      setItems(i);
      setAddOns(a);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  if (!pkg) {
    return <p className="py-10 text-center text-sm text-ink/40">Package not found.</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/packages"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-ink">{pkg.name}</h1>
        <Link
          to={`/packages/${pkg.id}/edit`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
          aria-label="Edit package"
        >
          <Pencil size={16} strokeWidth={2.2} />
        </Link>
      </div>

      {pkg.image ? (
        <img src={pkg.image} alt={pkg.name} className="mb-4 h-40 w-full rounded-2xl object-cover shadow-sm" />
      ) : (
        <div className="mb-4 flex h-40 w-full items-center justify-center rounded-2xl bg-brand-200/30 text-brand-600 shadow-sm">
          <Layers size={32} strokeWidth={1.5} />
        </div>
      )}

      {pkg.description && <p className="mb-4 px-1 text-sm text-ink/60">{pkg.description}</p>}

      <div className="mb-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-4 text-white shadow-sm">
        <p className="text-xs font-medium text-white/70">Package price</p>
        <p className="mt-0.5 text-2xl font-semibold">₱{pkg.price.toFixed(2)}</p>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Services included</p>
      {services.length === 0 && <EmptyState text="No services added to this package." />}
      <div className="mb-6 space-y-1.5">
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{s.service_name}</p>
            <span className="shrink-0 text-sm font-semibold text-ink/50">
              {s.quantity} {s.unit}
            </span>
          </div>
        ))}
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Items included</p>
      {items.length === 0 && <EmptyState text="No stock items added to this package." />}
      <div className="mb-6 space-y-1.5">
        {items.map((i) => {
          const doseCount = i.dose_size > 0 ? Math.round((i.quantity / i.dose_size) * 1e6) / 1e6 : null;
          const qtyLabel =
            doseCount != null ? `${doseCount} × ${i.dose_label || doseFallbackLabel(i.dose_size, i.unit)}` : `${i.quantity} ${i.unit}`;
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{i.item_name}</p>
              <span className="shrink-0 text-sm font-semibold text-ink/50">{qtyLabel}</span>
            </div>
          );
        })}
      </div>

      {addOns.length > 0 && (
        <>
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
            Available add-ons
          </p>
          <div className="flex flex-wrap gap-1.5">
            {addOns.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm"
              >
                <Sparkles size={12} strokeWidth={2.2} className="text-brand-500" />
                {a.name} · +₱{a.price.toFixed(2)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
