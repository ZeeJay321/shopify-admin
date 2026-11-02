/** Paging math for tables (pure). Pages are 1-based. */

import { formatNumber } from "../presentation/format";

export function totalPages(total: number, size: number): number {
  if (!(size > 0) || !(total > 0)) return 1;
  return Math.ceil(total / size);
}

export function clampPage(page: number, total: number, size: number): number {
  const last = totalPages(total, size);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), last);
}

/** The rows of one page of an in-memory list. */
export function pageSlice<T>(
  items: readonly T[],
  page: number,
  size: number,
): T[] {
  const current = clampPage(page, items.length, size);
  return items.slice((current - 1) * size, current * size);
}

export type PageRange = { from: number; to: number; text: string };

/**
 * "Showing 21–40 of 172". `total` null = unknown (cursor lists whose count
 * failed); `atLeast` marks Shopify's capped counts ("of 10,000+").
 */
export function pageRange({
  page,
  size,
  rowCount,
  total = null,
  atLeast = false,
}: {
  page: number;
  size: number;
  rowCount: number;
  total?: number | null;
  atLeast?: boolean;
}): PageRange {
  if (rowCount <= 0) return { from: 0, to: 0, text: "No results" };
  const from = (Math.max(1, Math.floor(page)) - 1) * size + 1;
  const to = from + rowCount - 1;
  const span = `${formatNumber(from)}–${formatNumber(to)}`;
  if (total === null) return { from, to, text: `Showing ${span}` };
  const shownTotal = Math.max(total, to);
  return {
    from,
    to,
    text: `Showing ${span} of ${formatNumber(shownTotal)}${atLeast ? "+" : ""}`,
  };
}
