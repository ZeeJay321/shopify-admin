/** Stable sorting for in-memory tables (pure). */

import type { TableSort } from "./params";

export type SortValue = string | number | null;

/**
 * Sorted copy of `rows`. Strings compare case-insensitively, nulls go last
 * in both directions, and equal rows keep their order.
 */
export function sortRows<T, F extends string>(
  rows: readonly T[],
  sort: TableSort<F> | null,
  accessors: Record<F, (row: T) => SortValue>,
): T[] {
  if (!sort) return [...rows];
  const get = accessors[sort.field];
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      const diff =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), "en", {
              sensitivity: "base",
              numeric: true,
            });
      return diff !== 0 ? diff * sign : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Case-insensitive "contains" filter on one text field. */
export function searchRows<T>(
  rows: readonly T[],
  q: string,
  text: (row: T) => string,
): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => text(row).toLowerCase().includes(needle));
}
