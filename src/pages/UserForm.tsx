import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import { hashPassword } from "../lib/hash";
import type { User, Role } from "../types";

const ROLES: Role[] = ["owner", "manager", "staff"];
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

const BLANK = { full_name: "", username: "", password: "" };

export default function UserForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [role, setRole] = useState<Role>("staff");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<User>("SELECT * FROM users WHERE id = ?", [id]).then(([u]) => {
      if (u) {
        setForm({ full_name: u.full_name, username: u.username, password: "" });
        setRole(u.role);
      }
      setLoading(false);
    });
  }, [id]);

  function update<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // True if the user currently being edited/archived is the only remaining active Owner.
  async function wouldRemoveLastOwner(): Promise<boolean> {
    if (!isEdit) return false;
    const [{ c }] = await select<{ c: number }>(
      "SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1 AND id != ?",
      [id],
    );
    return c === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.username.trim()) {
      setError("Name and username are required.");
      return;
    }
    if (!isEdit && !form.password.trim()) {
      setError("Password is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && role !== "owner") {
        const [current] = await select<User>("SELECT * FROM users WHERE id = ?", [id]);
        if (current?.role === "owner" && (await wouldRemoveLastOwner())) {
          setError("At least one Owner account must remain active.");
          setSaving(false);
          return;
        }
      }

      if (isEdit) {
        if (form.password.trim()) {
          const passwordHash = await hashPassword(form.password.trim());
          await execute("UPDATE users SET full_name = ?, username = ?, role = ?, password_hash = ? WHERE id = ?", [
            form.full_name.trim(),
            form.username.trim(),
            role,
            passwordHash,
            id,
          ]);
        } else {
          await execute("UPDATE users SET full_name = ?, username = ?, role = ? WHERE id = ?", [
            form.full_name.trim(),
            form.username.trim(),
            role,
            id,
          ]);
        }
      } else {
        const passwordHash = await hashPassword(form.password.trim());
        await execute(
          "INSERT INTO users (branch_id, full_name, username, password_hash, role) VALUES (1, ?, ?, ?, ?)",
          [form.full_name.trim(), form.username.trim(), passwordHash, role],
        );
      }
      navigate("/users");
    } catch (err) {
      const message = String(err);
      setError(message.includes("UNIQUE") ? "That username is already taken." : message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!id) return;
    const [current] = await select<User>("SELECT * FROM users WHERE id = ?", [id]);
    if (current?.role === "owner" && (await wouldRemoveLastOwner())) {
      setError("At least one Owner account must remain active.");
      return;
    }
    if (!confirm(`Remove ${form.full_name || "this user"}? They will no longer be able to sign in.`)) return;
    setSaving(true);
    try {
      await execute("UPDATE users SET is_active = 0 WHERE id = ?", [id]);
      navigate("/users");
    } catch (err) {
      setError(String(err));
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
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit user" : "Add user"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Full name *</span>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            required
            autoFocus
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Username *</span>
          <input
            type="text"
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">
            {isEdit ? "New password (optional)" : "Password *"}
          </span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder={isEdit ? "Leave blank to keep current" : undefined}
            required={!isEdit}
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <div className="rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-2 block text-xs font-medium text-ink/50">Role</span>
          <div className="flex gap-1.5 rounded-2xl bg-surface-muted p-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={
                  "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors " +
                  (role === r ? "bg-brand-500 text-white" : "text-ink/50")
                }
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add user"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove user"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
