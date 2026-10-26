import { localDate } from "./localDate";

// Shared "today / this week / this month / custom range" filter used across report pages.

export type Period = "today" | "week" | "month" | "custom";

function toISODate(d: Date) {
  return localDate(d);
}

export function periodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } | null {
  const now = new Date();
  if (period === "today") {
    const d = toISODate(now);
    return { from: d, to: d };
  }
  if (period === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    return { from: toISODate(monday), to: toISODate(now) };
  }
  if (period === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISODate(first), to: toISODate(now) };
  }
  if (!customFrom && !customTo) return null;
  return { from: customFrom || "0000-01-01", to: customTo || "9999-12-31" };
}
