import type { ReadingPoint } from "../lib/machineStatus";

/**
 * Small live line chart of raw sensor readings, with optional dashed reference lines for a
 * machine's calibrated idle/running baselines -- lets an admin actually see whether the
 * threshold sits in a sensible place relative to real readings, instead of trusting numbers
 * blind. Hand-rolled SVG rather than a charting library: this is the only chart in the app, and
 * the shape needed (a couple of lines over a rolling buffer) doesn't justify the dependency.
 */
export default function SensorReadingChart({
  history,
  idleBaseline,
  runningBaseline,
  height = 96,
}: {
  history: ReadingPoint[];
  idleBaseline?: number | null;
  runningBaseline?: number | null;
  height?: number;
}) {
  if (history.length < 2) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl bg-page text-xs text-ink/30"
      >
        Collecting live readings…
      </div>
    );
  }

  const width = 300; // viewBox units -- SVG scales to the container via width="100%" below
  const padY = 10;

  const values = history.map((p) => p.v);
  const refValues = [idleBaseline, runningBaseline].filter((v): v is number => v != null);
  const allValues = [...values, ...refValues];
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    // A perfectly flat reading (or a single reference value equal to it) would otherwise divide
    // by zero below -- widen the domain artificially so the line still renders, centered.
    min -= 50;
    max += 50;
  }
  const domainPad = (max - min) * 0.1;
  min -= domainPad;
  max += domainPad;

  const x = (i: number) => (i / (history.length - 1)) * width;
  const y = (v: number) => height - padY - ((v - min) / (max - min)) * (height - 2 * padY);

  const linePoints = history.map((p, i) => `${x(i)},${y(p.v)}`).join(" ");
  const last = history[history.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {idleBaseline != null && (
          <line
            x1={0}
            x2={width}
            y1={y(idleBaseline)}
            y2={y(idleBaseline)}
            stroke="currentColor"
            className="text-sky-400"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        {runningBaseline != null && (
          <line
            x1={0}
            x2={width}
            y1={y(runningBaseline)}
            y2={y(runningBaseline)}
            stroke="currentColor"
            className="text-amber-400"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        <polyline
          points={linePoints}
          fill="none"
          stroke="currentColor"
          className="text-brand-500"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(history.length - 1)} cy={y(last.v)} r={3} className="fill-brand-500" />
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink/40">
        <Legend swatchClassName="bg-brand-500" label={`Reading: ${last.v}`} />
        {idleBaseline != null && <Legend swatchClassName="text-sky-400" label={`Idle: ${idleBaseline}`} dashed />}
        {runningBaseline != null && (
          <Legend swatchClassName="text-amber-400" label={`Running: ${Math.round(runningBaseline)}`} dashed />
        )}
      </div>
    </div>
  );
}

function Legend({
  swatchClassName,
  label,
  dashed,
}: {
  swatchClassName: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={
          "h-0.5 w-3 " + (dashed ? `border-t border-dashed border-current ${swatchClassName}` : swatchClassName)
        }
      />
      {label}
    </span>
  );
}
