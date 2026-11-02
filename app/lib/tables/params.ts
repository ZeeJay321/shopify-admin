/**
 * Table state in the URL (pure): page, size, sort and search survive reload
 * and can be linked. Unknown or out-of-range values fall back to defaults.
 */

import { MAX_SEARCH_LENGTH, TABLE_PAGE_SIZES } from "../config";

export type PageSize = (typeof TABLE_PAGE_SIZES)[number];
export type SortDir = "asc" | "desc";
export type TableSort<F extends string> = { field: F; dir: SortDir };

export type TableParams<F extends string> = {
  page: number;
  size: PageSize;
  sort: TableSort<F> | null;
  q: string;
};

/** Params that only move within the current result set. */
const POSITION_PARAMS = ["page", "cursor", "dir"] as const;

export function isPageSize(value: number): value is PageSize {
  return TABLE_PAGE_SIZES.some((s) => s === value);
}

export function parseTableParams<F extends string>(
  params: URLSearchParams,
  {
    sortFields,
    defaultSort = null,
  }: { sortFields: readonly F[]; defaultSort?: TableSort<F> | null },
): TableParams<F> {
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: isPageSize(size) ? size : TABLE_PAGE_SIZES[0],
    sort: parseSort(params.get("sort"), sortFields) ?? defaultSort,
    q: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
  };
}

export function parseSort<F extends string>(
  raw: string | null,
  fields: readonly F[],
): TableSort<F> | null {
  if (!raw) return null;
  const [field, dir] = raw.split(":");
  const match = fields.find((f) => f === field);
  if (!match || (dir !== "asc" && dir !== "desc")) return null;
  return { field: match, dir };
}

export function formatSort<F extends string>(sort: TableSort<F>): string {
  return `${sort.field}:${sort.dir}`;
}

/** Clicking a header: a new field sorts ascending, the same field flips. */
export function nextSort<F extends string>(
  current: TableSort<F> | null,
  field: F,
): TableSort<F> {
  return current?.field === field
    ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
    : { field, dir: "asc" };
}

/**
 * New query string with `changes` applied (null deletes). Changing anything
 * other than the position (search, filters, sort, size) returns to page 1.
 */
export function withParams(
  current: URLSearchParams,
  changes: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const keys = Object.keys(changes);
  if (keys.some((k) => !POSITION_PARAMS.some((p) => p === k))) {
    for (const p of POSITION_PARAMS) next.delete(p);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  return next;
}
