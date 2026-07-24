import type { Period } from "../lib/period";

interface PeriodFilterProps {
  period: Period;
  onChange: (p: Period) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}

export default function PeriodFilter({
  period,
  onChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: PeriodFilterProps) {
  return (
    <>
      <div className="mb-2 flex gap-1.5 overflow-x-auto">
        {(["today", "week", "month", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors " +
              (period === p ? "bg-brand-500 text-white" : "bg-surface text-ink/60")
            }
          >
            {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
          <label className="block rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm">
            <span className="mb-0.5 block text-[10px] font-medium text-ink/40">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="w-full text-sm text-ink outline-none"
            />
          </label>
        </div>
      )}
    </>
  );
}
