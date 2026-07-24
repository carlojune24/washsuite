// Shared retail-pricing math so the percent vs. fixed-markup rule lives in one place
// instead of being reimplemented per page.

export type MarkupType = "percent" | "fixed";

export interface Markup {
  markup_type: MarkupType;
  markup_percent: number;
  markup_amount: number;
}

/** Retail price for one whole unit (e.g. one liter), given its current cost. */
export function retailPrice(cost: number, markup: Markup): number {
  return markup.markup_type === "fixed" ? cost + markup.markup_amount : cost * (1 + markup.markup_percent / 100);
}
