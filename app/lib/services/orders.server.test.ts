import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "../cache/memory-cache";
import { ShopifyApiError } from "../shopify/errors";
import type { AdminGraphqlClient } from "../shopify/client";
import { webhookHandlers } from "../webhooks/handlers";
import type { OrderSnapshot } from "../order-ops";

const mocks = vi.hoisted(() => ({
  getOrderCounts: vi.fn(),
  getOrdersPage: vi.fn(),
  getRecentOrdersSample: vi.fn(),
  loadInventorySummary: vi.fn(),
}));
vi.mock("../shopify/orders.server", () => ({
  UNFULFILLED_SEARCH: "status:open fulfillment_status:unfulfilled",
  getOrderCounts: mocks.getOrderCounts,
  getOrdersPage: mocks.getOrdersPage,
  getRecentOrdersSample: mocks.getRecentOrdersSample,
}));
vi.mock("./inventory-risk.server", () => ({
  loadInventorySummary: mocks.loadInventorySummary,
}));

import {
  loadOrdersPage,
  loadOrdersSummary,
  searchForFilter,
} from "./orders.server";

const client: AdminGraphqlClient = { graphql: vi.fn() };
const SHOP = "zj.myshopify.com";
const NOW = new Date("2026-10-30T12:00:00Z");
const count = { count: 1, atLeast: false };

const lowStockOrder: OrderSnapshot = {
  id: "1",
  name: "#1001",
  createdAt: "2026-10-30T11:00:00Z",
  cancelledAt: null,
  totalAmount: 20,
  currencyCode: "USD",
  financialStatus: "PAID",
  fulfillmentStatus: "FULFILLED",
  tags: [],
  lineItems: [{ title: "Tee", quantity: 1, variantId: "11", productId: "1" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getOrderCounts.mockResolvedValue({ today: count, unfulfilled: count });
  mocks.getRecentOrdersSample.mockResolvedValue({
    orders: [lowStockOrder],
    capped: false,
  });
  mocks.getOrdersPage.mockResolvedValue({
    orders: [lowStockOrder],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  });
  mocks.loadInventorySummary.mockResolvedValue({
    atRiskByVariantId: { "11": "low" },
  });
});

describe("loadOrdersSummary", () => {
  it("cross-references the cached inventory summary for low-stock items", async () => {
    const summary = await loadOrdersSummary(
      client,
      SHOP,
      new MemoryTaggedCache(),
      NOW,
    );
    expect(summary.aggregate.byReason.CONTAINS_LOW_STOCK_ITEM).toBe(1);
    expect(summary.inventoryCrossCheck).toBe("available");
    expect(mocks.loadInventorySummary).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully when inventory scopes are missing", async () => {
    mocks.loadInventorySummary.mockRejectedValue(
      new ShopifyApiError("access_denied", "Inventory", "read_inventory"),
    );
    const summary = await loadOrdersSummary(
      client,
      SHOP,
      new MemoryTaggedCache(),
      NOW,
    );
    expect(summary.inventoryCrossCheck).toBe("unavailable");
    expect(summary.aggregate.byReason.CONTAINS_LOW_STOCK_ITEM).toBe(0);
  });

  it("is cached and reloaded after orders/create", async () => {
    const cache = new MemoryTaggedCache();
    await loadOrdersSummary(client, SHOP, cache, NOW);
    await loadOrdersSummary(client, SHOP, cache, NOW);
    expect(mocks.getRecentOrdersSample).toHaveBeenCalledTimes(1);

    await webhookHandlers.ORDERS_CREATE({ shop: SHOP, payload: {}, cache });
    await loadOrdersSummary(client, SHOP, cache, NOW);
    expect(mocks.getRecentOrdersSample).toHaveBeenCalledTimes(2);
  });

  it("propagates order permission errors for the page to show", async () => {
    mocks.getRecentOrdersSample.mockRejectedValue(
      new ShopifyApiError("access_denied", "Orders", "protected customer data"),
    );
    await expect(
      loadOrdersSummary(client, SHOP, new MemoryTaggedCache(), NOW),
    ).rejects.toMatchObject({ kind: "access_denied" });
  });
});

describe("loadOrdersPage", () => {
  it("filters needs_attention on the current page", async () => {
    const page = await loadOrdersPage(client, SHOP, new MemoryTaggedCache(), {
      filter: "needs_attention",
      now: NOW,
    });
    expect(page.pageRowCount).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].assessment.reasons).toEqual([
      "CONTAINS_LOW_STOCK_ITEM",
    ]);
  });
});

describe("searchForFilter", () => {
  it("builds server-side searches", () => {
    expect(searchForFilter("unfulfilled", NOW)).toBe(
      "status:open fulfillment_status:unfulfilled",
    );
    expect(searchForFilter("high_value", NOW)).toBe(
      "current_total_price:>=500",
    );
    expect(searchForFilter("recent", NOW)).toBe(
      "created_at:>='2026-10-23T12:00:00.000Z'",
    );
    expect(searchForFilter("needs_attention", NOW)).toBeNull();
    expect(searchForFilter(null, NOW)).toBeNull();
  });
});
