import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IdCard, Search, UserPlus } from "lucide-react";
import { select } from "../lib/db";
import type { Worker } from "../types";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

export default function Employees() {
  const [employees, setEmployees] = useState<Worker[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    select<Worker>("SELECT * FROM workers WHERE is_active = 1 ORDER BY full_name").then(setEmployees);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.contact_no ?? "").toLowerCase().includes(q) ||
        (e.position ?? "").toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Employees" />
        <Link
          to="/employees/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add employee"
        >
          <UserPlus size={17} strokeWidth={2.2} />
        </Link>
      </div>

      <label className="mb-4 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
        <Search size={16} strokeWidth={2.2} className="text-ink/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone…"
          className="w-full text-sm text-ink outline-none placeholder:text-ink/30"
        />
      </label>

      {filtered.length === 0 && (
        <EmptyState text={employees.length === 0 ? "No employees yet." : "No employees match your search."} />
      )}

      <ul className="space-y-2">
        {filtered.map((e) => (
          <ListRow
            key={e.id}
            to={`/employees/${e.id}/edit`}
            icon={IdCard}
            title={e.full_name}
            subtitle={[e.position, e.contact_no].filter(Boolean).join(" · ") || "No details on file"}
            value={`₱${e.rate.toFixed(2)}`}
          />
        ))}
      </ul>
    </div>
  );
}
