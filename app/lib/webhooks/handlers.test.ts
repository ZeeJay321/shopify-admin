import { describe, expect, it, vi } from "vitest";
import {
  inventorySummaryKey,
  keyTags,
  ordersSummaryKey,
  readinessKey,
  productHealthKey,
  storeCountsKey,
  storeHealthSampleKey,
} from "../cache/keys";
import type { CachedProductHealth } from "../cache/keys";
import { MemoryTaggedCache } from "../cache/memory-cache";
import type { InventoryRiskSummary } from "../services/inventory-risk.server";
import type { OrdersSummary } from "../services/orders.server";
import type { ReadinessReport } from "../storefront-readiness/types";
import type { StoreHealthSample } from "../services/store-health.server";
import type { StoreCounts } from "../shopify/products.server";
import { handlerFor, webhookHandlers } from "./handlers";

const SHOP = "a.myshopify.com";
const OTHER = "b.myshopify.com";

const counts = {} as StoreCounts;
const sample = {} as StoreHealthSample;
const inventory = {} as InventoryRiskSummary;
const product = (id: string): CachedProductHealth => ({
  summary: {} as CachedProductHealth["summary"],
  inventoryItemIds: [`${id}01`],
});

/** Fill every cache entry the app uses, for two shops. */
function warmCache() {
  const cache = new MemoryTaggedCache();
  for (const shop of [SHOP, OTHER]) {
    cache.set(shop, storeCountsKey, counts, {
      tags: keyTags.storeCounts(shop),
    });
    cache.set(shop, storeHealthSampleKey, sample, {
      tags: keyTags.storeHealthSample(shop),
    });
    cache.set(shop, inventorySummaryKey, inventory, {
      tags: keyTags.inventorySummary(shop),
    });
    for (const id of ["42", "43"]) {
      cache.set(shop, productHealthKey(id), product(id), {
        tags: keyTags.productHealth(shop, id, product(id).inventoryItemIds),
      });
    }
  }
  return cache;
}

function present(cache: MemoryTaggedCache, shop: string) {
  return {
    counts: cache.get(shop, storeCountsKey) !== undefined,
    sample: cache.get(shop, storeHealthSampleKey) !== undefined,
    inventory: cache.get(shop, inventorySummaryKey) !== undefined,
    product42: cache.get(shop, productHealthKey("42")) !== undefined,
    product43: cache.get(shop, productHealthKey("43")) !== undefined,
  };
}

const ALL_PRESENT = {
  counts: true,
  sample: true,
  inventory: true,
  product42: true,
  product43: true,
};

describe("webhook -> cache invalidation", () => {
  it.each(["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"] as const)(
    "%s invalidates counts, sample, inventory summary and that product only",
    async (topic) => {
      const cache = warmCache();
      await webhookHandlers[topic]({ shop: SHOP, payload: { id: 42 }, cache });

      expect(present(cache, SHOP)).toEqual({
        counts: false,
        sample: false,
        inventory: false,
        product42: false,
        product43: true,
      });
      expect(present(cache, OTHER)).toEqual(ALL_PRESENT);
    },
  );

  it("INVENTORY_LEVELS_UPDATE invalidates inventory data and the product owning the item", async () => {
    const cache = warmCache();
    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop: SHOP,
      payload: { inventory_item_id: 4201, location_id: 1, available: 0 },
      cache,
    });

    expect(present(cache, SHOP)).toEqual({
      counts: true,
      sample: false,
      inventory: false,
      product42: false,
      product43: true,
    });
    expect(present(cache, OTHER)).toEqual(ALL_PRESENT);
  });

  it("INVENTORY_LEVELS_UPDATE without an item id falls back to the products tag", async () => {
    const cache = warmCache();
    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop: SHOP,
      payload: {},
      cache,
    });
    expect(present(cache, SHOP)).toEqual({
      counts: false,
      sample: false,
      inventory: false,
      product42: true, // product entries aren't tagged "products"; TTL covers them
      product43: true,
    });
  });

  it("is idempotent: running a handler twice has the same effect", async () => {
    const cache = warmCache();
    const ctx = { shop: SHOP, payload: { id: "42" }, cache };
    await webhookHandlers.PRODUCTS_UPDATE(ctx);
    const afterFirst = present(cache, SHOP);
    await webhookHandlers.PRODUCTS_UPDATE(ctx);
    expect(present(cache, SHOP)).toEqual(afterFirst);
  });

  it("sends delete events to the storefront without a handle", async () => {
    const notifyStorefront = vi.fn();
    await webhookHandlers.PRODUCTS_DELETE({
      shop: SHOP,
      // authenticate.webhook JSON.parses the body, so large ids lose precision
      payload: JSON.parse('{"id": 788032119674292922}'),
      cache: new MemoryTaggedCache(),
      notifyStorefront,
    });
    expect(notifyStorefront).toHaveBeenCalledWith({
      topic: "products/delete",
      productId: null, // beyond Number.MAX_SAFE_INTEGER: refuse a lossy id
      handle: null,
    });
  });
});

describe("product id parsing", () => {
  it("prefers admin_graphql_api_id so large ids stay exact", async () => {
    const notifyStorefront = vi.fn();
    await webhookHandlers.PRODUCTS_UPDATE({
      shop: SHOP,
      payload: JSON.parse(
        '{"id": 788032119674292922, "admin_graphql_api_id": "gid://shopify/Product/788032119674292922", "handle": "example-t-shirt"}',
      ),
      cache: new MemoryTaggedCache(),
      notifyStorefront,
    });
    expect(notifyStorefront).toHaveBeenCalledWith({
      topic: "products/update",
      productId: "788032119674292922",
      handle: "example-t-shirt",
    });
  });
});

describe("inventory item id parsing", () => {
  it("reads the exact item id from admin_graphql_api_id", async () => {
    const cache = new MemoryTaggedCache();
    const key = productHealthKey("9");
    cache.set(SHOP, key, product("9"), {
      tags: keyTags.productHealth(SHOP, "9", ["271878346596884015"]),
    });
    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop: SHOP,
      payload: JSON.parse(
        '{"inventory_item_id": 271878346596884015, "admin_graphql_api_id": "gid://shopify/InventoryLevel/24826418?inventory_item_id=271878346596884015"}',
      ),
      cache,
    });
    expect(cache.get(SHOP, key)).toBeUndefined();
  });
});

describe("handlerFor", () => {
  it("resolves supported topics only", () => {
    expect(handlerFor("PRODUCTS_UPDATE")).toBe(webhookHandlers.PRODUCTS_UPDATE);
    expect(handlerFor("CUSTOMERS_CREATE")).toBeUndefined();
    expect(handlerFor("ORDERS_CREATE")).toBe(webhookHandlers.ORDERS_CREATE);
    expect(handlerFor("toString")).toBeUndefined();
  });
});

describe("phase 4 tags: orders and readiness", () => {
  function warmPhase4() {
    const cache = new MemoryTaggedCache();
    for (const shop of [SHOP, OTHER]) {
      cache.set(shop, ordersSummaryKey, {} as OrdersSummary, {
        tags: keyTags.ordersSummary(shop),
      });
      cache.set(shop, readinessKey, {} as ReadinessReport, {
        tags: keyTags.readiness(shop),
      });
      cache.set(shop, storeCountsKey, counts, {
        tags: keyTags.storeCounts(shop),
      });
    }
    return cache;
  }

  const state = (cache: MemoryTaggedCache, shop: string) => ({
    orders: cache.get(shop, ordersSummaryKey) !== undefined,
    readiness: cache.get(shop, readinessKey) !== undefined,
    counts: cache.get(shop, storeCountsKey) !== undefined,
  });

  it.each(["ORDERS_CREATE", "ORDERS_UPDATED"] as const)(
    "%s invalidates only the orders summary, for that shop only",
    async (topic) => {
      const cache = warmPhase4();
      await webhookHandlers[topic]({ shop: SHOP, payload: { id: 1 }, cache });
      expect(state(cache, SHOP)).toEqual({
        orders: false,
        readiness: true,
        counts: true,
      });
      expect(state(cache, OTHER)).toEqual({
        orders: true,
        readiness: true,
        counts: true,
      });
    },
  );

  it("product webhooks invalidate readiness (and orders, via the inventory tag)", async () => {
    const cache = warmPhase4();
    await webhookHandlers.PRODUCTS_DELETE({
      shop: SHOP,
      payload: { id: 1 },
      cache,
    });
    // products/* also invalidates `inventory`, which the orders summary
    // depends on for its low-stock reasons.
    expect(state(cache, SHOP)).toEqual({
      orders: false,
      readiness: false,
      counts: false,
    });
    expect(state(cache, OTHER)).toEqual({
      orders: true,
      readiness: true,
      counts: true,
    });
  });

  it("inventory webhooks invalidate readiness and the orders summary (low-stock reasons)", async () => {
    const cache = warmPhase4();
    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop: SHOP,
      payload: { inventory_item_id: 5 },
      cache,
    });
    expect(state(cache, SHOP)).toEqual({
      orders: false,
      readiness: false,
      counts: true,
    });
    expect(state(cache, OTHER)).toEqual({
      orders: true,
      readiness: true,
      counts: true,
    });
  });
});
