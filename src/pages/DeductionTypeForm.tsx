import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import type { DeductionType } from "../types";

const BLANK = { name: "", employee_share: "0", employer_share: "0" };

export default function DeductionTypeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<DeductionType>("SELECT * FROM deduction_types WHERE id = ?", [id]).then(([t]) => {
      if (t) {
        setForm({
          name: t.name,
          employee_share: String(t.employee_share),
          employer_share: String(t.employer_share),
        });
      }
      setLoading(false);
    });
  }, [id]);

  function update<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const values = [form.name.trim(), Number(form.employee_share) || 0, Number(form.employer_share) || 0];
      if (isEdit) {
        await execute("UPDATE deduction_types SET name = ?, employee_share = ?, employer_share = ? WHERE id = ?", [
          ...values,
          id,
        ]);
      } else {
        await execute(
          "INSERT INTO deduction_types (name, employee_share, employer_share) VALUES (?, ?, ?)",
          values,
        );
      }
      navigate("/deduction-types");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${form.name || "this deduction type"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE deduction_types SET is_active = 0 WHERE id = ?", [id]);
      navigate("/deduction-types");
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
          to="/deduction-types"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit deduction type" : "Add deduction type"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Name *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. SSS, PhilHealth, Pag-IBIG"
            required
            autoFocus
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Default employee share</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.employee_share}
              onChange={(e) => update("employee_share", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Default employer share</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.employer_share}
              onChange={(e) => update("employer_share", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>
        <p className="px-1 text-[11px] text-ink/40">
          These are just starting defaults offered when assigning this deduction to a worker — each worker's actual
          amount is editable per worker.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add deduction type"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove deduction type"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
