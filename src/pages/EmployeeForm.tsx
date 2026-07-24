import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { execute, select } from "../lib/db";
import type { Worker } from "../types";

const PAY_TYPES: Worker["pay_type"][] = ["daily", "hourly", "monthly", "per_piece"];

const BLANK = { full_name: "", contact_no: "", position: "", pay_type: "daily" as Worker["pay_type"], rate: "", date_hired: "" };

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    select<Worker>("SELECT * FROM workers WHERE id = ?", [id]).then(([w]) => {
      if (w) {
        setForm({
          full_name: w.full_name,
          contact_no: w.contact_no ?? "",
          position: w.position ?? "",
          pay_type: w.pay_type,
          rate: w.rate ? String(w.rate) : "",
          date_hired: w.date_hired ?? "",
        });
      }
      setLoading(false);
    });
  }, [id]);

  function update<K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) {
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
        form.contact_no.trim() || null,
        form.position.trim() || null,
        form.pay_type,
        Number(form.rate) || 0,
        form.date_hired || null,
      ];
      if (isEdit) {
        await execute(
          "UPDATE workers SET full_name = ?, contact_no = ?, position = ?, pay_type = ?, rate = ?, date_hired = ? WHERE id = ?",
          [...values, id],
        );
      } else {
        await execute(
          "INSERT INTO workers (branch_id, full_name, contact_no, position, pay_type, rate, date_hired) VALUES (1, ?, ?, ?, ?, ?, ?)",
          values,
        );
      }
      navigate("/employees");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Remove ${form.full_name || "this employee"}?`)) return;
    setSaving(true);
    try {
      await execute("UPDATE workers SET is_active = 0 WHERE id = ?", [id]);
      navigate("/employees");
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
          to="/employees"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">{isEdit ? "Edit employee" : "Add employee"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" value={form.full_name} onChange={(v) => update("full_name", v)} required autoFocus />
        <Field label="Phone number" value={form.contact_no} onChange={(v) => update("contact_no", v)} type="tel" />
        <Field label="Position" value={form.position} onChange={(v) => update("position", v)} placeholder="e.g. Washer, Cashier" />

        <div className="grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Pay type</span>
            <select
              value={form.pay_type}
              onChange={(e) => update("pay_type", e.target.value as Worker["pay_type"])}
              className="w-full bg-transparent text-sm font-medium text-ink outline-none"
            >
              {PAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "per_piece" ? "Per piece" : t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
            <span className="mb-1 block text-xs font-medium text-ink/50">Rate</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
              placeholder="0.00"
              className="w-full text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
        </div>

        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Date hired</span>
          <input
            type="date"
            value={form.date_hired}
            onChange={(e) => update("date_hired", e.target.value)}
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-red-600 shadow-sm disabled:opacity-60"
              aria-label="Remove employee"
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
