import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { execute, select } from "../lib/db";
import type { PayrollSettings as PayrollSettingsType } from "../types";

export default function PayrollSettings() {
  const navigate = useNavigate();

  const [overtimeMultiplier, setOvertimeMultiplier] = useState("1.25");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    select<PayrollSettingsType>("SELECT * FROM payroll_settings WHERE id = 1").then(([s]) => {
      if (s) setOvertimeMultiplier(String(s.overtime_multiplier));
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    const multiplier = Number(overtimeMultiplier);
    if (!(multiplier > 0)) {
      setError("Enter a multiplier greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await execute("UPDATE payroll_settings SET overtime_multiplier = ? WHERE id = 1", [multiplier]);
      toast.success("Payroll settings saved");
      navigate(-1);
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
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">Payroll Settings</h1>
          <p className="truncate text-xs text-ink/50">How overtime is valued on payroll runs</p>
        </div>
      </div>

      <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink/40 uppercase">Overtime</p>
      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Overtime pay multiplier</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="any"
            value={overtimeMultiplier}
            onChange={(e) => setOvertimeMultiplier(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
          <p className="mt-1 text-[11px] text-ink/40">
            e.g. 1.25 means overtime hours are paid at 125% of the worker's hourly-equivalent rate.
            Applied on top of the {(Number(overtimeMultiplier) || 0).toFixed(2)}× rate for every hour logged as
            overtime in Attendance.
          </p>
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
