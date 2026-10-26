/** Local-calendar "YYYY-MM-DD" for a Date. toISOString() gives the UTC date, which is the previous
 * day for UTC+ shops (e.g. Manila) before 8 AM and for local-midnight dates like "first of month". */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
