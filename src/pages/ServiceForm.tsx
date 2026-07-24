import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import type { ServiceType } from "../types";

const BLANK = { name: "", unit: "kg", price: "0" };

export default function ServiceForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<ServiceType>("SELECT * FROM service_types WHERE id = ?", [id]).then(([s]) => {
      if (s) setForm({ name: s.name, unit: s.unit, price: String(s.price) });
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
    if (!form.unit.trim()) {
      setError("Unit is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const values = [form.name.trim(), form.unit.trim(), Number(form.price) || 0];
      if (isEdit) {
        await execute("UPDATE service_types SET name = ?, unit = ?, price = ? WHERE id = ?", [...values, id]);
      } else {
        await execute("INSERT INTO service_types (name, unit, price) VALUES (?, ?, ?)", values);
      }
      navigate("/services");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${form.name || "this service"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE service_types SET is_active = 0 WHERE id = ?", [id]);
      navigate("/services");
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
          to="/services"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit service" : "Add service"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Name *</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Wash & Fold"
            required
            autoFocus
            className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Unit *</span>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => update("unit", e.target.value)}
              placeholder="kg, piece, load"
              required
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Price per unit</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              className="w-full text-sm font-medium text-ink outline-none"
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add service"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove service"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
