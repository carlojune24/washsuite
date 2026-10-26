import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, WashingMachine, Layers } from "lucide-react";
import { select } from "../lib/db";
import { type Period, periodRange } from "../lib/period";
import PeriodFilter from "../components/PeriodFilter";
import ListRow, { EmptyState } from "../components/ListRow";

interface ServiceRow {
  service_type_id: number;
  name: string;
  total: number;
  count: number;
}

interface PackageRow {
  package_id: number;
  name: string;
  price: number;
  order_count: number;
}

export default function ReportServiceRevenue() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const range = periodRange(period, customFrom, customTo);
    const dateConditions: string[] = [];
    const dateParams: unknown[] = [];
    if (range) {
      dateConditions.push("substr(o.drop_off_at,1,10) >= ?", "substr(o.drop_off_at,1,10) <= ?");
      dateParams.push(range.from, range.to);
    }
    const dateWhere = dateConditions.length ? `AND ${dateConditions.join(" AND ")}` : "";

    setLoading(true);
    Promise.all([
      select<ServiceRow>(
        `SELECT oi.service_type_id, st.name, SUM(oi.line_total) AS total, COUNT(*) AS count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN service_types st ON st.id = oi.service_type_id
         WHERE oi.service_type_id IS NOT NULL AND oi.line_total > 0 AND o.status != 'cancelled' ${dateWhere}
         GROUP BY oi.service_type_id
         ORDER BY total DESC`,
        dateParams,
      ),
      select<PackageRow>(
        `SELECT o.package_id, sp.name, sp.price, COUNT(*) AS order_count
         FROM orders o
         JOIN service_packages sp ON sp.id = o.package_id
         WHERE o.package_id IS NOT NULL AND o.status != 'cancelled' ${dateWhere}
         GROUP BY o.package_id
         ORDER BY order_count DESC`,
        dateParams,
      ),
    ]).then(([svc, pkg]) => {
      setServices(svc);
      setPackages(pkg);
      setLoading(false);
    });
  }, [period, customFrom, customTo]);

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/reports"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Revenue by service/package</h1>
      </div>

      <PeriodFilter
        period={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">
        Standalone services
      </p>
      <p className="mb-2 px-1 text-[11px] text-ink/40">
        Only services sold on their own — services bundled inside a package have no separate price, their
        revenue shows under the package instead.
      </p>
      {!loading && services.length === 0 && <EmptyState text="No standalone service sales in this period." />}
      <ul className="mb-6 space-y-2">
        {services.map((s) => (
          <ListRow
            key={s.service_type_id}
            icon={WashingMachine}
            title={s.name}
            subtitle={`${s.count} sold this period`}
            value={`₱${s.total.toFixed(2)}`}
          />
        ))}
      </ul>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Packages</p>
      <p className="mb-2 px-1 text-[11px] text-ink/40">
        Revenue estimated as the package's current price × times ordered — doesn't include any extras added
        alongside a package in the same order.
      </p>
      {!loading && packages.length === 0 && <EmptyState text="No packages ordered in this period." />}
      <ul className="space-y-2">
        {packages.map((p) => (
          <ListRow
            key={p.package_id}
            icon={Layers}
            title={p.name}
            subtitle={`${p.order_count} order${p.order_count === 1 ? "" : "s"} · ₱${p.price.toFixed(2)} each`}
            value={`₱${(p.price * p.order_count).toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
