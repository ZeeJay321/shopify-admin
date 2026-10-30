/** Product status filters (shared by server loaders and UI). */
export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUSES)[number];

export function isProductStatusFilter(
  value: string | null | undefined,
): value is ProductStatusFilter {
  return PRODUCT_STATUSES.some((s) => s === value);
}
