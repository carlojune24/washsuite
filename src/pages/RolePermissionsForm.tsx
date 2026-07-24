import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronLeft } from "lucide-react";
import { execute, select } from "../lib/db";
import { PAGE_MODULES } from "../lib/permissions";
import type { RolePermission, Role } from "../types";

type EditableRole = Extract<Role, "manager" | "staff">;

const ROLE_LABEL: Record<EditableRole, string> = { manager: "Manager", staff: "Staff" };

export default function RolePermissionsForm() {
  const navigate = useNavigate();
  const [managerKeys, setManagerKeys] = useState<Set<string>>(new Set());
  const [staffKeys, setStaffKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<RolePermission>("SELECT * FROM role_permissions").then((rows) => {
      setManagerKeys(new Set(rows.filter((r) => r.role === "manager").map((r) => r.page_key)));
      setStaffKeys(new Set(rows.filter((r) => r.role === "staff").map((r) => r.page_key)));
      setLoading(false);
    });
  }, []);

  function toggle(role: EditableRole, key: string) {
    const setter = role === "manager" ? setManagerKeys : setStaffKeys;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await execute("DELETE FROM role_permissions WHERE role = 'manager'");
      await execute("DELETE FROM role_permissions WHERE role = 'staff'");
      for (const key of managerKeys) {
        await execute("INSERT INTO role_permissions (role, page_key) VALUES ('manager', ?)", [key]);
      }
      for (const key of staffKeys) {
        await execute("INSERT INTO role_permissions (role, page_key) VALUES ('staff', ?)", [key]);
      }
      navigate("/users");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/users"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Permissions</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <RoleSection role="manager" selected={managerKeys} onToggle={toggle} />
        <RoleSection role="staff" selected={staffKeys} onToggle={toggle} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function RoleSection({
  role,
  selected,
  onToggle,
}: {
  role: EditableRole;
  selected: Set<string>;
  onToggle: (role: EditableRole, key: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">{ROLE_LABEL[role]}</p>
      <div className="flex flex-wrap gap-1.5">
        {PAGE_MODULES.map(({ key, label }) => {
          const checked = selected.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(role, key)}
              className={
                "flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium shadow-sm transition-colors " +
                (checked ? "bg-brand-500 text-white" : "bg-surface text-ink")
              }
            >
              <span
                className={
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border " +
                  (checked ? "border-white/70 bg-white/20" : "border-ink/15")
                }
              >
                {checked && <Check size={9} strokeWidth={3.5} />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
