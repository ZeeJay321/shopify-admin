import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "../cache/memory-cache";
import { webhookHandlers } from "../webhooks/handlers";
import type { AdminGraphqlClient } from "../shopify/client";

const { getStoreCounts, getProductSample } = vi.hoisted(() => ({
  getStoreCounts: vi.fn(),
  getProductSample: vi.fn(),
}));
vi.mock("../shopify/products.server", () => ({
  getStoreCounts,
  getProductSample,
}));

import { loadStoreHealth } from "./store-health.server";

const client: AdminGraphqlClient = { graphql: vi.fn() };
const SHOP = "zj.myshopify.com";
const count = { count: 1, atLeast: false };

beforeEach(() => {
  vi.clearAllMocks();
  getStoreCounts.mockResolvedValue({
    all: count,
    active: count,
    draft: count,
    archived: count,
  });
  getProductSample.mockResolvedValue({ products: [], capped: false });
});

describe("loadStoreHealth (read-through cache)", () => {
  it("serves repeat loads from cache and reloads after a product webhook", async () => {
    const cache = new MemoryTaggedCache();

    await loadStoreHealth(client, SHOP, cache);
    await loadStoreHealth(client, SHOP, cache);
    expect(getStoreCounts).toHaveBeenCalledTimes(1);
    expect(getProductSample).toHaveBeenCalledTimes(1);

    await webhookHandlers.PRODUCTS_UPDATE({
      shop: SHOP,
      payload: { id: 1 },
      cache,
    });
    await loadStoreHealth(client, SHOP, cache);
    expect(getStoreCounts).toHaveBeenCalledTimes(2);
    expect(getProductSample).toHaveBeenCalledTimes(2);
  });

  it("reloads only the health sample after an inventory webhook", async () => {
    const cache = new MemoryTaggedCache();
    await loadStoreHealth(client, SHOP, cache);

    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop: SHOP,
      payload: { inventory_item_id: 9 },
      cache,
    });
    await loadStoreHealth(client, SHOP, cache);

    expect(getStoreCounts).toHaveBeenCalledTimes(1);
    expect(getProductSample).toHaveBeenCalledTimes(2);
  });
});
