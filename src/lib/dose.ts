/**
 * Fallback display text when an item has no explicit dose_label — e.g. "0.03liter". Always
 * rounds first so floating-point noise in a stored fraction (e.g. 0.030000000000000002, which
 * can happen from round-tripping dose_size through a small-unit conversion) never leaks into
 * the UI as a raw float string.
 */
export function doseFallbackLabel(doseSize: number, unit: string): string {
  return `${Math.round(doseSize * 100) / 100}${unit}`;
}
