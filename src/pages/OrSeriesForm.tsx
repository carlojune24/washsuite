import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { registerOrSeries } from "../lib/orSeries";
import { localDate } from "../lib/localDate";

function today() {
  return localDate(new Date());
}

export default function OrSeriesForm() {
  const navigate = useNavigate();
  const [seriesStart, setSeriesStart] = useState("");
  const [seriesEnd, setSeriesEnd] = useState("");
  const [permitNo, setPermitNo] = useState("");
  const [registeredAt, setRegisteredAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const start = Number(seriesStart);
    const end = Number(seriesEnd);
    if (!seriesStart || !seriesEnd || !Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
      setError("Enter a valid series start and end.");
      return;
    }
    if (!registeredAt) {
      setError("Registered date is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await registerOrSeries({
        seriesStart: start,
        seriesEnd: end,
        permitNo: permitNo.trim() || null,
        registeredAt,
        notes: notes.trim() || null,
      });
      toast.success("Series registered");
      navigate("/settings/or-series");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-2 bg-page pb-2">
        <Link
          to="/settings/or-series"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm"
        >
          <ChevronLeft size={18} strokeWidth={2.2} />
        </Link>
        <h1 className="text-xl font-semibold text-ink">Register OR Series</h1>
      </div>

      <div className="mb-4 space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Series start</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={seriesStart}
              onChange={(e) => setSeriesStart(e.target.value)}
              placeholder="1"
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/50">Series end</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={seriesEnd}
              onChange={(e) => setSeriesEnd(e.target.value)}
              placeholder="50"
              className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Permit No. (optional)</span>
          <input
            value={permitNo}
            onChange={(e) => setPermitNo(e.target.value)}
            placeholder="Uses Business Info permit if left blank"
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none placeholder:text-ink/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Registered date</span>
          <input
            type="date"
            value={registeredAt}
            onChange={(e) => setRegisteredAt(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/50">Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-ink outline-none"
          />
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {saving ? "Registering…" : "Register series"}
      </button>
    </div>
  );
}
