import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import type { Customer } from "../types";

const BLANK = { full_name: "", address: "", phone: "", landmark: "", tin: "" };

export default function CustomerForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<Customer>("SELECT * FROM customers WHERE id = ?", [id]).then(([c]) => {
      if (c) {
        setForm({
          full_name: c.full_name,
          address: c.address ?? "",
          phone: c.phone ?? "",
          landmark: c.landmark ?? "",
          tin: c.tin ?? "",
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
    if (!form.full_name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const values = [
        form.full_name.trim(),
        form.address.trim() || null,
        form.phone.trim() || null,
        form.landmark.trim() || null,
        form.tin.trim() || null,
      ];
      if (isEdit) {
        await execute(
          "UPDATE customers SET full_name = ?, address = ?, phone = ?, landmark = ?, tin = ?, updated_at = datetime('now') WHERE id = ?",
          [...values, id],
        );
      } else {
        await execute(
          "INSERT INTO customers (full_name, address, phone, landmark, tin) VALUES (?, ?, ?, ?, ?)",
          values,
        );
      }
      navigate("/customers");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${form.full_name || "this customer"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE customers SET is_active = 0 WHERE id = ?", [id]);
      navigate("/customers");
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
          to="/customers"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit customer" : "Add customer"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" value={form.full_name} onChange={(v) => update("full_name", v)} required autoFocus />
        <Field label="Address" value={form.address} onChange={(v) => update("address", v)} />
        <Field label="Phone number" value={form.phone} onChange={(v) => update("phone", v)} type="tel" />
        <Field
          label="Landmark"
          value={form.landmark}
          onChange={(v) => update("landmark", v)}
          placeholder="e.g. Near the barangay hall"
        />
        <Field
          label="TIN (optional)"
          value={form.tin}
          onChange={(v) => update("tin", v)}
          placeholder="For sales invoice printing"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove customer"
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
      <span className="mb-1 block text-xs font-medium text-ink/50">
        {label}
        {required && " *"}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
      />
    </label>
  );
}
