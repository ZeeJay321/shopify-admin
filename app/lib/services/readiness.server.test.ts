import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "../cache/memory-cache";
import { perfectProduct } from "../product-health/test-fixtures";
import type { AdminGraphqlClient } from "../shopify/client";
import { ShopifyApiError } from "../shopify/errors";
import type { ProductRecord } from "../shopify/snapshot";
import { webhookHandlers } from "../webhooks/handlers";

const mocks = vi.hoisted(() => ({
  getProductSample: vi.fn(),
  getCollections: vi.fn(),
}));
vi.mock("../shopify/products.server", () => ({
  getProductSample: mocks.getProductSample,
}));
vi.mock("../shopify/collections.server", () => ({
  getCollections: mocks.getCollections,
}));

import { invalidateReadiness, loadReadiness } from "./readiness.server";

const client: AdminGraphqlClient = { graphql: vi.fn() };
const SHOP = "a.myshopify.com";
const OTHER = "b.myshopify.com";

const record: ProductRecord = {
  snapshot: perfectProduct({ id: "gid://shopify/Product/42" }),
  handle: "hoodie",
  imageUrl: null,
  imageAlt: null,
  inventoryItemIds: ["9001"],
  inAnyCollection: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getProductSample.mockResolvedValue({
    products: [record],
    capped: false,
  });
  mocks.getCollections.mockResolvedValue({
    collections: [{ id: "1", title: "All", handle: "all", productCount: 1 }],
    capped: false,
  });
});

describe("loadReadiness", () => {
  it("evaluates the store and caches the report", async () => {
    const cache = new MemoryTaggedCache();
    const report = await loadReadiness(client, SHOP, cache);
    expect(report.score).toBe(100);
    await loadReadiness(client, SHOP, cache);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(1);
  });

  it("uses numeric product ids for report links", async () => {
    mocks.getProductSample.mockResolvedValue({
      products: [
        { ...record, snapshot: { ...record.snapshot, imageCount: 0 } },
      ],
      capped: false,
    });
    const report = await loadReadiness(client, SHOP, new MemoryTaggedCache());
    const images = report.checks.find((c) => c.id === "images");
    expect(images?.affectedResources[0]).toMatchObject({
      id: "42",
      handle: "hoodie",
    });
  });

  it.each([
    ["PRODUCTS_UPDATE", { id: 42 }],
    ["INVENTORY_LEVELS_UPDATE", { inventory_item_id: 9001 }],
  ] as const)("is invalidated by %s", async (topic, payload) => {
    const cache = new MemoryTaggedCache();
    await loadReadiness(client, SHOP, cache);
    await webhookHandlers[topic]({ shop: SHOP, payload, cache });
    await loadReadiness(client, SHOP, cache);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(2);
  });

  it("is not invalidated by order webhooks", async () => {
    const cache = new MemoryTaggedCache();
    await loadReadiness(client, SHOP, cache);
    await webhookHandlers.ORDERS_UPDATED({ shop: SHOP, payload: {}, cache });
    await loadReadiness(client, SHOP, cache);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(1);
  });

  it("recheck invalidates only this shop's report", async () => {
    const cache = new MemoryTaggedCache();
    await loadReadiness(client, SHOP, cache);
    await loadReadiness(client, OTHER, cache);
    invalidateReadiness(SHOP, cache);
    await loadReadiness(client, SHOP, cache);
    await loadReadiness(client, OTHER, cache);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(3);
  });

  it("treats unreadable collections as partial data", async () => {
    mocks.getCollections.mockRejectedValue(
      new ShopifyApiError("graphql", "Collections", "boom"),
    );
    const report = await loadReadiness(client, SHOP, new MemoryTaggedCache());
    expect(report.collectionCount).toBeNull();
    expect(
      report.checks.find((c) => c.id === "collections_non_empty")?.status,
    ).toBe("not_applicable");
  });

  it("propagates throttling instead of hiding it as partial data", async () => {
    mocks.getCollections.mockRejectedValue(
      new ShopifyApiError("throttled", "Collections", "busy"),
    );
    await expect(
      loadReadiness(client, SHOP, new MemoryTaggedCache()),
    ).rejects.toMatchObject({ kind: "throttled" });
  });
});
