/**
 * Webhook handler registry: topic -> handler.
 *
 * Handlers do minimal, idempotent work: invalidate cache tags and (optionally)
 * ping the storefront. They never call the Admin API; pages reload fresh data
 * on their next read.
 */

import type { TaggedCache } from "../cache/types";
import { cacheTags } from "../cache/types";
import { numericIdFromGid } from "../shopify/gid";

export type StorefrontEvent = {
  topic: "products/create" | "products/update" | "products/delete";
  productId: string | null;
  handle: string | null;
};

export type WebhookHandlerContext = {
  shop: string;
  payload: unknown;
  cache: TaggedCache;
  /** Fire-and-forget; must never throw into the handler. */
  notifyStorefront?: (event: StorefrontEvent) => void;
};

export type WebhookHandler = (
  ctx: WebhookHandlerContext,
) => void | Promise<void>;

const PRODUCT_TOPICS = {
  PRODUCTS_CREATE: "products/create",
  PRODUCTS_UPDATE: "products/update",
  PRODUCTS_DELETE: "products/delete",
} as const;

function productHandler(
  storefrontTopic: StorefrontEvent["topic"],
): WebhookHandler {
  return ({ shop, payload, cache, notifyStorefront }) => {
    // Prefer the exact GID string: JSON numbers above 2^53 lose precision.
    const productId =
      numericIdFromGid(
        readString(payload, "admin_graphql_api_id"),
        "Product",
      ) ?? readNumericId(payload, "id");
    cache.invalidateTags(productInvalidationTags(shop, productId));
    notifyStorefront?.({
      topic: storefrontTopic,
      productId,
      handle: readString(payload, "handle"),
    });
  };
}

const inventoryLevelsUpdate: WebhookHandler = ({ shop, payload, cache }) => {
  // admin_graphql_api_id looks like
  // gid://shopify/InventoryLevel/24826418?inventory_item_id=271878346596884015
  // and keeps the item id exact; fall back to the numeric field.
  const fromGid = /[?&]inventory_item_id=(\d+)/.exec(
    readString(payload, "admin_graphql_api_id") ?? "",
  )?.[1];
  cache.invalidateTags(
    inventoryInvalidationTags(
      shop,
      fromGid ?? readNumericId(payload, "inventory_item_id"),
    ),
  );
};

/**
 * orders/create, orders/updated: the payload is protected customer data. We
 * read nothing from it; we only invalidate the orders summary.
 */
const ordersChanged: WebhookHandler = ({ shop, cache }) => {
  cache.invalidateTags([cacheTags.orders(shop)]);
};

export const webhookHandlers = {
  PRODUCTS_CREATE: productHandler(PRODUCT_TOPICS.PRODUCTS_CREATE),
  PRODUCTS_UPDATE: productHandler(PRODUCT_TOPICS.PRODUCTS_UPDATE),
  PRODUCTS_DELETE: productHandler(PRODUCT_TOPICS.PRODUCTS_DELETE),
  INVENTORY_LEVELS_UPDATE: inventoryLevelsUpdate,
  ORDERS_CREATE: ordersChanged,
  ORDERS_UPDATED: ordersChanged,
} satisfies Record<string, WebhookHandler>;

export type SupportedTopic = keyof typeof webhookHandlers;

export function handlerFor(topic: string): WebhookHandler | undefined {
  return Object.hasOwn(webhookHandlers, topic)
    ? webhookHandlers[topic as SupportedTopic]
    : undefined;
}

/**
 * products/*: the product list, counts, dashboard sample, inventory
 * summary and storefront readiness all change; so does that product's own
 * entry.
 * Without a usable id, the products tag still covers the product entries'
 * aggregates; per-product entries then expire by TTL.
 */
export function productInvalidationTags(
  shop: string,
  productId: string | null,
): string[] {
  const tags = [
    cacheTags.products(shop),
    cacheTags.inventory(shop),
    cacheTags.readiness(shop),
  ];
  if (productId) tags.push(cacheTags.product(shop, productId));
  return tags;
}

/**
 * inventory_levels/update: the payload has only the inventory item id.
 * Product entries are tagged with their variants' inventory item ids, so
 * this finds the affected product without an Admin API call. If the id is
 * missing, fall back to the whole products tag.
 */
export function inventoryInvalidationTags(
  shop: string,
  inventoryItemId: string | null,
): string[] {
  // Readiness includes "out of stock only", so stock changes affect it too.
  const tags = [cacheTags.inventory(shop), cacheTags.readiness(shop)];
  return inventoryItemId
    ? [...tags, cacheTags.inventoryItem(shop, inventoryItemId)]
    : [...tags, cacheTags.products(shop)];
}

function readNumericId(payload: unknown, field: string): string | null {
  if (!isRecord(payload)) return null;
  const value = payload[field];
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  return /^\d+$/.test(text) ? text : null;
}

function readString(payload: unknown, field: string): string | null {
  if (!isRecord(payload)) return null;
  const value = payload[field];
  return typeof value === "string" && value !== "" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
