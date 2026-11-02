/**
 * Sequential bulk runner for fixes on many products (phase 6).
 *
 * One item at a time (runQuery already backs off on throttling). Results are
 * per item and never rolled back. If Shopify still throttles, or permission
 * is missing, the remaining items are marked "Not attempted" instead of
 * hammering the API. Raw Shopify detail stays in server logs.
 */

import type { BatchOutcome } from "../../actions";
import type { WriteErrorCode as MutationErrorCode } from "../../shopify/mutations/types";
import { isShopifyApiError } from "../../shopify/errors";

export type BulkItem = { productId: string; productTitle: string };
export type ItemResult = { ok: boolean; message: string };

const STOP_MESSAGES = {
  throttled: "Shopify was busy. Try this one again.",
  access_denied: "The app needs permission for this change.",
} as const;

export async function runSequential<T extends BulkItem>(
  items: readonly T[],
  run: (item: T) => Promise<ItemResult>,
  logLabel = "bulk",
): Promise<BatchOutcome[]> {
  const results: BatchOutcome[] = [];
  let stopped = false;
  for (const item of items) {
    const base = { productId: item.productId, productTitle: item.productTitle };
    if (stopped) {
      results.push({
        ...base,
        ok: false,
        message: "Not attempted. Try again in a moment.",
      });
      continue;
    }
    try {
      results.push({ ...base, ...(await run(item)) });
    } catch (error) {
      if (!isShopifyApiError(error)) throw error;
      console.warn(
        `[actions] ${logLabel} resource=${item.productId} shopify_error=${error.kind}`,
      );
      if (error.kind === "throttled" || error.kind === "access_denied") {
        stopped = true;
        results.push({
          ...base,
          ok: false,
          message: STOP_MESSAGES[error.kind],
        });
      } else {
        results.push({
          ...base,
          ok: false,
          message:
            error.kind === "not_found" || error.kind === "invalid_id"
              ? "This product no longer exists."
              : "Couldn't update this product.",
        });
      }
    }
  }
  return results;
}

/** Friendly per-item copy for a mutation's userErrors. */
export function itemErrorMessage(code: MutationErrorCode): string {
  switch (code) {
    case "not_found":
      return "This product no longer exists.";
    case "permission":
      return "The app needs permission for this change.";
    case "conflict":
      return "This changed in Shopify. Reload and try again.";
    case "validation":
      return "Shopify didn't accept this change.";
    default:
      return "Couldn't update this product.";
  }
}

/** Pairs repeated `productId` / `productTitle` form fields. */
export function bulkItems(form: FormData, ids: readonly string[]): BulkItem[] {
  const allIds = form.getAll("productId").map(String);
  const titles = form.getAll("productTitle").map(String);
  return ids.map((productId) => {
    const index = allIds.indexOf(productId);
    const title = index >= 0 ? titles[index] : undefined;
    return { productId, productTitle: title?.trim() || `Product ${productId}` };
  });
}
