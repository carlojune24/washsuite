import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, ShieldCheck, UserCircle2 } from "lucide-react";
import { select } from "../lib/db";
import type { User } from "../types";
import ListRow, { EmptyState, PageHeading } from "../components/ListRow";

const ROLE_LABEL: Record<User["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    select<User>("SELECT * FROM users WHERE is_active = 1 ORDER BY full_name").then(setUsers);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageHeading title="Users" hint="Who can sign in, and what they can access." />
        <Link
          to="/users/new"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm"
          aria-label="Add user"
        >
          <PlusCircle size={18} strokeWidth={2.2} />
        </Link>
      </div>

      <Link
        to="/users/permissions"
        className="mb-4 flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-sm"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-200/50 text-brand-600">
          <ShieldCheck size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Manager &amp; Staff permissions</p>
          <p className="truncate text-xs text-ink/50">Choose which pages each role can access</p>
        </div>
      </Link>

      {users.length === 0 && <EmptyState text="No users yet." />}

      <ul className="space-y-2">
        {users.map((u) => (
          <ListRow
            key={u.id}
            to={`/users/${u.id}/edit`}
            icon={UserCircle2}
            title={u.full_name}
            subtitle={`@${u.username}`}
            value={ROLE_LABEL[u.role]}
          />
        ))}
      </ul>
    </div>
  );
}
