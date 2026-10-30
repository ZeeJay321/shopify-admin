/** Order Operations filters (shared by the server loader and the UI). */
export const ORDER_FILTERS = [
  "needs_attention",
  "unfulfilled",
  "high_value",
  "recent",
] as const;

export type OrderFilter = (typeof ORDER_FILTERS)[number];

export function isOrderFilter(value: string | null): value is OrderFilter {
  return ORDER_FILTERS.some((f) => f === value);
}
