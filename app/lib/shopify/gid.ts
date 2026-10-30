import { ShopifyApiError } from "./errors";

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/(\d+)$/;
const NUMERIC_ID = /^\d+$/;

/**
 * Accept a numeric id (as used in our URLs) or a full Product GID.
 * Anything else, including GIDs of other types, is an `invalid_id` error.
 */
export function toProductGid(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (NUMERIC_ID.test(trimmed) && trimmed !== "0") {
    return `gid://shopify/Product/${trimmed}`;
  }
  if (PRODUCT_GID.test(trimmed)) {
    return trimmed;
  }
  throw new ShopifyApiError("invalid_id", "Product id", "not a Product id");
}

/** `gid://shopify/Product/123` -> `"123"`; null for anything else. */
export function productNumericIdOrNull(
  gid: string | null | undefined,
): string | null {
  const match = PRODUCT_GID.exec(gid ?? "");
  return match ? match[1] : null;
}

/** `gid://shopify/Product/123` -> `"123"`. */
export function toNumericId(gid: string): string {
  const id = productNumericIdOrNull(gid);
  if (!id) {
    throw new ShopifyApiError("invalid_id", "Product id", "not a Product GID");
  }
  return id;
}

/** Numeric id from any `gid://shopify/{type}/{id}`; null on mismatch. */
export function numericIdFromGid(
  gid: string | null | undefined,
  type: string,
): string | null {
  const prefix = `gid://shopify/${type}/`;
  if (!gid?.startsWith(prefix)) return null;
  const id = gid.slice(prefix.length);
  return /^\d+$/.test(id) ? id : null;
}
