/**
 * Order reads for Order Operations (read_orders; last 60 days only).
 *
 * Privacy: these queries select NO customer fields (no customer, email,
 * phone, billing/shipping address). Orders are still "protected customer
 * data" (level 1), so the app needs protected customer data access
 * configured in the Partner Dashboard; without it Shopify denies access and
 * this layer raises an `access_denied` ShopifyApiError.
 */

import {
  ORDER_LINE_ITEMS_LIMIT,
  ORDERS_PAGE_SIZE,
  ORDERS_SAMPLE_CAP,
} from "../config";
import { startOfDayIso } from "../order-ops/dates";
import type { OrderSnapshot } from "../order-ops/types";
import type {
  OrderCountsQuery,
  RecentOrdersQuery,
  ShopTimezoneQuery,
} from "../../types/admin.generated";
import type { AdminGraphqlClient } from "./client";
import { runQuery } from "./client";
import { numericIdFromGid } from "./gid";
import { collectPages } from "./pagination";
import type { ProductCount } from "./products.server";
import { parsePrice } from "./snapshot";

// --- Counts -----------------------------------------------------------------

const SHOP_TIMEZONE = `#graphql
  query ShopTimezone {
    shop { ianaTimezone }
  }
`;

const ORDER_COUNTS = `#graphql
  query OrderCounts($today: String!, $unfulfilled: String!) {
    today: ordersCount(query: $today, limit: null) { count precision }
    unfulfilled: ordersCount(query: $unfulfilled, limit: null) { count precision }
  }
`;

/** Open orders that still need fulfilment (not cancelled or closed). */
export const UNFULFILLED_SEARCH = "status:open fulfillment_status:unfulfilled";

export type OrderCounts = { today: ProductCount; unfulfilled: ProductCount };

export async function getOrderCounts(
  client: AdminGraphqlClient,
  now: Date = new Date(),
): Promise<OrderCounts> {
  const { shop } = await runQuery<ShopTimezoneQuery>(
    client,
    "Shop timezone",
    SHOP_TIMEZONE,
  );
  const data = await runQuery<OrderCountsQuery>(
    client,
    "Order counts",
    ORDER_COUNTS,
    {
      today: `created_at:>='${startOfDayIso(now, shop.ianaTimezone)}'`,
      unfulfilled: UNFULFILLED_SEARCH,
    },
  );
  const toCount = (c: OrderCountsQuery["today"]): ProductCount => ({
    count: c?.count ?? 0,
    atLeast: c?.precision === "AT_LEAST",
  });
  return { today: toCount(data.today), unfulfilled: toCount(data.unfulfilled) };
}

// --- Recent orders ----------------------------------------------------------

const RECENT_ORDERS = `#graphql
  query RecentOrders(
    $first: Int
    $after: String
    $last: Int
    $before: String
    $query: String
    $lineItemsFirst: Int!
  ) {
    orders(
      first: $first
      after: $after
      last: $last
      before: $before
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: $lineItemsFirst) {
          nodes {
            title
            quantity
            variant { id }
            product { id }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }
`;

export type OrdersPageRequest = {
  cursor?: string | null;
  direction?: "next" | "prev";
  /** Shopify order search syntax, built by the caller from filters. */
  search?: string | null;
  pageSize?: number;
};

export type OrdersPage = {
  orders: OrderSnapshot[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

export async function getOrdersPage(
  client: AdminGraphqlClient,
  {
    cursor = null,
    direction = "next",
    search = null,
    pageSize = ORDERS_PAGE_SIZE,
  }: OrdersPageRequest = {},
): Promise<OrdersPage> {
  const paging =
    direction === "prev" && cursor
      ? { last: pageSize, before: cursor }
      : { first: pageSize, after: cursor };

  const data = await runQuery<RecentOrdersQuery>(
    client,
    "Orders",
    RECENT_ORDERS,
    { ...paging, query: search, lineItemsFirst: ORDER_LINE_ITEMS_LIMIT },
  );
  const { pageInfo } = data.orders;
  return {
    orders: data.orders.nodes.flatMap(toOrderSnapshot),
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      hasPreviousPage: pageInfo.hasPreviousPage,
      startCursor: pageInfo.startCursor ?? null,
      endCursor: pageInfo.endCursor ?? null,
    },
  };
}

/** Bounded scan of the most recent orders for the summary cards. */
export async function getRecentOrdersSample(
  client: AdminGraphqlClient,
  cap: number = ORDERS_SAMPLE_CAP,
): Promise<{ orders: OrderSnapshot[]; capped: boolean }> {
  const { nodes, capped } = await collectPages(
    async (cursor, pageSize) => {
      const page = await getOrdersPage(client, { cursor, pageSize });
      return { nodes: page.orders, pageInfo: page.pageInfo };
    },
    { cap, pageSize: 50 },
  );
  return { orders: nodes, capped };
}

type OrderNode = RecentOrdersQuery["orders"]["nodes"][number];

export function toOrderSnapshot(node: OrderNode): OrderSnapshot[] {
  const id = numericIdFromGid(node.id, "Order");
  if (!id) return [];
  const money = node.currentTotalPriceSet.shopMoney;
  return [
    {
      id,
      name: node.name,
      createdAt: String(node.createdAt),
      cancelledAt: node.cancelledAt ? String(node.cancelledAt) : null,
      totalAmount: parsePrice(money.amount) ?? 0,
      currencyCode: String(money.currencyCode),
      financialStatus: node.displayFinancialStatus ?? null,
      fulfillmentStatus: node.displayFulfillmentStatus,
      tags: node.tags,
      lineItems: node.lineItems.nodes.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        variantId: numericIdFromGid(item.variant?.id, "ProductVariant"),
        productId: numericIdFromGid(item.product?.id, "Product"),
      })),
    },
  ];
}
