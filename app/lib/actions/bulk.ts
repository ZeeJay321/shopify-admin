/** Bulk fix planning and result summaries (pure). */

import { BULK_ACTION_MAX } from "../config";
import type { BatchOutcome } from "./index";
import type { FieldError } from "./types";

export type BulkIds =
  { ok: true; ids: string[] } | { ok: false; error: FieldError };

/**
 * Validated, de-duplicated numeric product ids. Empty, malformed or
 * over-cap requests are rejected before anything reaches Shopify.
 */
export function parseBulkIds(
  raw: readonly unknown[],
  cap: number = BULK_ACTION_MAX,
): BulkIds {
  const ids = [...new Set(raw.map((v) => String(v).trim()))];
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))) {
    return {
      ok: false,
      error: { field: "form", message: "Select at least one product." },
    };
  }
  if (ids.length > cap) {
    return {
      ok: false,
      error: {
        field: "form",
        message: `Select ${cap} products or fewer per update.`,
      },
    };
  }
  return { ok: true, ids };
}

export type BulkKind = "publish" | "activate";

/** "This will publish 25 products to Headless Storefront." */
export function describeBulk(
  kind: BulkKind,
  count: number,
  channelName?: string,
): string {
  const products = `${count} product${count === 1 ? "" : "s"}`;
  return kind === "publish"
    ? `This will publish ${products} to ${channelName ?? "the selected channel"}.`
    : `This will set ${products} to active so shoppers can buy them.`;
}

export function summarizeBulk(results: readonly BatchOutcome[]): {
  succeeded: number;
  failed: number;
  message: string;
} {
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return {
    succeeded,
    failed,
    message:
      failed === 0
        ? `All ${results.length} updated.`
        : `${succeeded} of ${results.length} updated; ${failed} need attention.`,
  };
}
