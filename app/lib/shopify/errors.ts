/**
 * Typed errors for Admin API access, plus merchant-facing copy.
 *
 * Raw Shopify messages are kept on the error for server logs only; UI code
 * must use `toMerchantMessage`, which never echoes upstream text or tokens.
 */

export type ShopifyApiErrorKind =
  | "throttled"
  | "access_denied"
  | "not_found"
  | "invalid_id"
  | "graphql"
  | "user_errors"
  | "http";

export class ShopifyApiError extends Error {
  readonly kind: ShopifyApiErrorKind;
  readonly operation: string;

  constructor(kind: ShopifyApiErrorKind, operation: string, detail: string) {
    super(`${operation}: ${detail}`);
    this.name = "ShopifyApiError";
    this.kind = kind;
    this.operation = operation;
  }
}

export function isShopifyApiError(error: unknown): error is ShopifyApiError {
  return error instanceof ShopifyApiError;
}

export type MerchantError = {
  kind: ShopifyApiErrorKind;
  title: string;
  message: string;
};

const MERCHANT_COPY: Record<
  ShopifyApiErrorKind,
  Omit<MerchantError, "kind">
> = {
  throttled: {
    title: "Shopify is busy",
    message:
      "Your store's API limit was reached while loading products. Wait a few seconds and reload the page.",
  },
  access_denied: {
    title: "Missing permission",
    message:
      "The app doesn't have permission to read this data. Open the app from Shopify Admin and approve the requested access (new features can need new permissions), or reinstall the app.",
  },
  not_found: {
    title: "Product not found",
    message:
      "This product doesn't exist or was deleted. Go back to the Product Health list and pick another product.",
  },
  invalid_id: {
    title: "Invalid product link",
    message:
      "This link doesn't point to a product. Go back to the Product Health list and pick a product.",
  },
  graphql: {
    title: "Couldn't load data from Shopify",
    message: "Shopify returned an error. Reload the page to try again.",
  },
  user_errors: {
    title: "Shopify rejected the request",
    message: "Shopify couldn't complete the request. Reload and try again.",
  },
  http: {
    title: "Shopify is unavailable",
    message: "Shopify didn't respond as expected. Reload the page in a moment.",
  },
};

export function toMerchantMessage(error: ShopifyApiError): MerchantError {
  return { kind: error.kind, ...MERCHANT_COPY[error.kind] };
}

/**
 * For route loaders: turn a ShopifyApiError into merchant-safe data the page
 * can render, log the technical detail server-side, and re-throw anything
 * else (auth responses, bugs) to the route's error boundary.
 */
export function toLoaderError(error: unknown): MerchantError {
  if (!isShopifyApiError(error)) throw error;
  console.warn(`[shopify] ${error.kind}: ${error.message}`);
  return toMerchantMessage(error);
}
