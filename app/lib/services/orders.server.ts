/**
 * Order Operations data: cached summary (counts + bounded recent sample) and
 * live table pages. The low-stock cross-check reads the cached phase 3
 * inventory summary once per load (never per order) and degrades to
 * "unavailable" when inventory access is missing.
 */

import type { TaggedCache } from "../cache/types";
import { keyTags, ordersSummaryKey } from "../cache/keys";
import {
  HIGH_VALUE_ORDER_THRESHOLD,
  ORDERS_CHART_DAYS,
  RECENT_ORDER_DAYS,
} from "../config";
import type {
  DayCount,
  LowStockLookup,
  OrderAssessment,
  OrdersAggregate,
  OrderSnapshot,
} from "../order-ops";
import { aggregateOrders, classifyOrder, ordersPerDay } from "../order-ops";
import { daysAgoIso } from "../order-ops/dates";
import type { OrderFilter } from "../order-ops/filters";
import type { AdminGraphqlClient } from "../shopify/client";
import { isShopifyApiError } from "../shopify/errors";
import type {
  OrderCounts,
  OrdersPage,
  OrdersPageRequest,
} from "../shopify/orders.server";
import { joinQuery } from "../shopify/search";
import {
  UNFULFILLED_SEARCH,
  getOrderCounts,
  getOrdersPage,
  getRecentOrdersSample,
} from "../shopify/orders.server";
import { loadInventorySummary } from "./inventory-risk.server";

export type InventoryCrossCheck = "available" | "unavailable";

export type OrdersSummary = {
  counts: OrderCounts;
  sampleSize: number;
  capped: boolean;
  aggregate: OrdersAggregate;
  inventoryCrossCheck: InventoryCrossCheck;
  /** Shop IANA timezone ("UTC" when unknown). */
  timeZone: string;
  /** Sampled orders per shop day, oldest first, covered days only. */
  perDay: DayCount[];
  /** Sampled orders by Shopify display fulfillment status. */
  fulfillmentMix: Record<string, number>;
};

/** Server-side search for a filter; needs_attention is computed by the app. */
export function searchForFilter(
  filter: OrderFilter | null,
  now: Date,
): string | null {
  switch (filter) {
    case "unfulfilled":
      return UNFULFILLED_SEARCH;
    case "high_value":
      return `current_total_price:>=${HIGH_VALUE_ORDER_THRESHOLD}`;
    case "recent":
      return `created_at:>='${daysAgoIso(now, RECENT_ORDER_DAYS)}'`;
    default:
      return null;
  }
}

/** Low-stock lookup from the cached inventory summary (phase 3). */
export async function loadLowStockLookup(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
): Promise<{ lookup: LowStockLookup; crossCheck: InventoryCrossCheck }> {
  try {
    const { atRiskByVariantId } = await loadInventorySummary(
      client,
      shop,
      cache,
    );
    return {
      lookup: (variantId) => atRiskByVariantId[variantId],
      crossCheck: "available",
    };
  } catch (error) {
    // Missing read_inventory / read_locations, throttling, etc.: orders still
    // work, just without the low-stock reason.
    if (!isShopifyApiError(error)) throw error;
    console.warn(`[orders] Inventory cross-check unavailable: ${error.kind}`);
    return { lookup: () => undefined, crossCheck: "unavailable" };
  }
}

export async function loadOrdersSummary(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  now: Date = new Date(),
): Promise<OrdersSummary> {
  return cache.getOrLoad(
    shop,
    ordersSummaryKey,
    { tags: keyTags.ordersSummary(shop) },
    async () => {
      const meta: { timeZone?: string } = {};
      const [{ lookup, crossCheck }, counts, sample] = await Promise.all([
        loadLowStockLookup(client, shop, cache),
        getOrderCounts(client, now, meta),
        getRecentOrdersSample(client),
      ]);
      const timeZone = meta.timeZone ?? "UTC";
      const assessments = sample.orders.map((o) =>
        classifyOrder(o, { now, lowStock: lookup }),
      );
      return {
        counts,
        sampleSize: sample.orders.length,
        capped: sample.capped,
        aggregate: aggregateOrders(assessments),
        inventoryCrossCheck: crossCheck,
        timeZone,
        perDay: ordersPerDay(
          sample.orders.map((o) => o.createdAt),
          {
            now,
            timeZone,
            days: ORDERS_CHART_DAYS,
            // Newest first: a capped sample only covers back to its last order.
            coveredFrom: sample.capped
              ? (sample.orders.at(-1)?.createdAt ?? null)
              : null,
          },
        ),
        fulfillmentMix: countBy(sample.orders, (o) => o.fulfillmentStatus),
      };
    },
  );
}

function countBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return result;
}

export type OrderRow = { order: OrderSnapshot; assessment: OrderAssessment };

export async function loadOrdersPage(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  {
    cursor = null,
    direction = "next",
    filter = null,
    now = new Date(),
    search = null,
    sort,
    pageSize,
  }: {
    cursor?: string | null;
    direction?: "next" | "prev";
    filter?: OrderFilter | null;
    now?: Date;
    /** Order-name search (from `orderNameSearch`). */
    search?: string | null;
    sort?: OrdersPageRequest["sort"];
    pageSize?: number;
  },
): Promise<{
  rows: OrderRow[];
  pageRowCount: number;
  pageInfo: OrdersPage["pageInfo"];
  inventoryCrossCheck: InventoryCrossCheck;
}> {
  const [{ lookup, crossCheck }, page] = await Promise.all([
    loadLowStockLookup(client, shop, cache),
    getOrdersPage(client, {
      cursor,
      direction,
      search: joinQuery(searchForFilter(filter, now), search),
      sort,
      pageSize,
    }),
  ]);
  const rows = page.orders.map((order) => ({
    order,
    assessment: classifyOrder(order, { now, lowStock: lookup }),
  }));
  return {
    rows:
      filter === "needs_attention"
        ? rows.filter((r) => r.assessment.needsAttention)
        : rows,
    pageRowCount: rows.length,
    pageInfo: page.pageInfo,
    inventoryCrossCheck: crossCheck,
  };
}
