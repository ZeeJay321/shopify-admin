/**
 * Rows for one check's affected-products table (pure): joins the full
 * affected list with the product index, then searches, sorts and pages it,
 * so the client only receives the current page.
 */

import { clampPage, pageSlice, searchRows, sortRows } from "../tables";
import type { TableParams } from "../tables";
import type { CheckResult, ReadinessProductRow } from "./types";

export const AFFECTED_SORT_FIELDS = [
  "title",
  "status",
  "vendor",
  "score",
] as const;
export type AffectedSortField = (typeof AFFECTED_SORT_FIELDS)[number];

export type AffectedRow = {
  kind: "product" | "collection";
  id: string;
  /** Display title ("(untitled)" when empty). */
  title: string;
  /** Title as stored in Shopify, for edit dialogs and stale checks. */
  rawTitle: string;
  handle: string;
  problem: string;
  vendor: string | null;
  status: string | null;
  imageUrl: string | null;
  score: number | null;
  description: string;
};

export function affectedRows(
  check: CheckResult,
  index: Readonly<Record<string, ReadinessProductRow>> = {},
): AffectedRow[] {
  return check.affectedResources.map((r) => {
    const product = r.kind === "product" ? index[r.id] : undefined;
    return {
      kind: r.kind,
      id: r.id,
      title: product?.title || r.title,
      rawTitle: product?.title ?? "",
      handle: r.handle,
      problem: r.problem ?? check.name,
      vendor: product?.vendor || null,
      status: product?.status ?? null,
      imageUrl: product?.imageUrl ?? null,
      score: product?.score ?? null,
      description: product?.description ?? "",
    };
  });
}

export function affectedPage(
  rows: readonly AffectedRow[],
  params: TableParams<AffectedSortField>,
): { rows: AffectedRow[]; total: number; page: number } {
  const matching = searchRows(rows, params.q, (r) => r.title);
  const sorted = sortRows(matching, params.sort, {
    title: (r) => r.title,
    status: (r) => r.status,
    vendor: (r) => r.vendor,
    score: (r) => r.score,
  });
  const page = clampPage(params.page, sorted.length, params.size);
  return {
    rows: pageSlice(sorted, page, params.size),
    total: sorted.length,
    page,
  };
}
