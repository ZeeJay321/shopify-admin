/**
 * Typed cache keys and their invalidation tags, in one place so the
 * webhook-to-invalidation mapping is easy to audit.
 *
 * | Key                    | Tags                                     |
 * |------------------------|------------------------------------------|
 * | store-counts           | products                                 |
 * | store-health-sample[:channel] | products, inventory               |
 * | inventory-summary      | inventory, products                      |
 * | product-health:{id}[:channel] | product:{id}, inventory-item:...  |
 * | orders-summary         | orders, inventory                        |
 * | storefront-readiness:* | readiness, publications                  |
 * | sales-channels         | publications                             |
 */

import type { HealthSummaryResponse } from "../product-health-api/contract";
import type { StoreHealthSample } from "../services/store-health.server";
import type { InventoryRiskSummary } from "../services/inventory-risk.server";
import type { OrdersSummary } from "../services/orders.server";
import type {
  ReadinessReport,
  SalesChannel,
} from "../storefront-readiness/types";
import type { StoreCounts } from "../shopify/products.server";
import { cacheKey, cacheTags } from "./types";

export const storeCountsKey = cacheKey<StoreCounts>("store-counts");
export const storeHealthSampleKey = cacheKey<StoreHealthSample>(
  "store-health-sample",
);
/**
 * Scores depend on the scoring sales channel, so each channel gets its own
 * entry. No channel = the original key (Online Store only).
 */
export const storeHealthSampleKeyFor = (channelId?: string | null) =>
  channelId
    ? cacheKey<StoreHealthSample>(`store-health-sample:${channelId}`)
    : storeHealthSampleKey;
export const inventorySummaryKey =
  cacheKey<InventoryRiskSummary>("inventory-summary");
export type CachedProductHealth = {
  summary: HealthSummaryResponse;
  /** Kept so inventory_levels/update can find this entry by item id. */
  inventoryItemIds: string[];
};
export const ordersSummaryKey = cacheKey<OrdersSummary>("orders-summary");
/** One readiness report per checked sales channel ("default" = Online Store URL). */
export const readinessKey = (channel = "default") =>
  cacheKey<ReadinessReport>(`storefront-readiness:${channel}`);
export const salesChannelsKey = cacheKey<SalesChannel[]>("sales-channels");
export const productHealthKey = (
  productId: string,
  channelId?: string | null,
) =>
  cacheKey<CachedProductHealth>(
    channelId
      ? `product-health:${productId}:${channelId}`
      : `product-health:${productId}`,
  );

export const keyTags = {
  storeCounts: (shop: string) => [cacheTags.products(shop)],
  storeHealthSample: (shop: string) => [
    cacheTags.products(shop),
    cacheTags.inventory(shop),
  ],
  inventorySummary: (shop: string) => [
    cacheTags.inventory(shop),
    cacheTags.products(shop),
  ],
  // Low-stock reasons come from inventory risk, so inventory changes count too.
  ordersSummary: (shop: string) => [
    cacheTags.orders(shop),
    cacheTags.inventory(shop),
  ],
  readiness: (shop: string) => [
    cacheTags.readiness(shop),
    cacheTags.publications(shop),
  ],
  salesChannels: (shop: string) => [cacheTags.publications(shop)],
  productHealth: (
    shop: string,
    productId: string,
    inventoryItemIds: readonly string[],
  ) => [
    cacheTags.product(shop, productId),
    ...inventoryItemIds.map((id) => cacheTags.inventoryItem(shop, id)),
  ],
};
