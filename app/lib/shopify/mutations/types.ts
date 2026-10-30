/**
 * Typed mutation outcomes. userErrors become WriteErrors here; transport,
 * permission and throttling failures are thrown by `runQuery` as
 * ShopifyApiError and mapped by the service layer.
 */

export type WriteErrorCode =
  "validation" | "conflict" | "not_found" | "permission" | "failed";

export type WriteError = {
  code: WriteErrorCode;
  /** Our form field name when Shopify points at one ("title", "quantity"...). */
  field?: string;
  /** Raw Shopify detail for server logs only; never sent to the UI. */
  detail: string;
};

export type MutationResult<T> =
  { ok: true; data: T } | { ok: false; error: WriteError };
