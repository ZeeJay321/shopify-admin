import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "../cache/memory-cache";
import { cacheKey, cacheTags } from "../cache/types";
import { processWebhook } from "./process.server";
import { createTestStore } from "./test-store";

const SHOP = "zj.myshopify.com";
const productKey = cacheKey<string>("product-health:42");

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function setup() {
  const { store, rows } = createTestStore();
  const cache = new MemoryTaggedCache();
  cache.set(SHOP, productKey, "cached", {
    tags: [cacheTags.product(SHOP, "42")],
  });
  return { store, rows, cache };
}

const delivery = (webhookId = "wh-1", topic = "PRODUCTS_UPDATE") => ({
  shop: SHOP,
  topic,
  webhookId,
  payload: { id: 42, handle: "hoodie" },
});

describe("processWebhook", () => {
  it("processes a valid delivery: records the id and invalidates the cache", async () => {
    const { store, rows, cache } = setup();
    const maybeCleanup = vi.fn(async () => 0);

    const response = await processWebhook(
      { store, cache, maybeCleanup },
      delivery(),
    );

    expect(response.status).toBe(200);
    expect(rows).toEqual([
      expect.objectContaining({
        shop: SHOP,
        webhookId: "wh-1",
        topic: "PRODUCTS_UPDATE",
      }),
    ]);
    expect(cache.get(SHOP, productKey)).toBeUndefined();
    expect(maybeCleanup).toHaveBeenCalledTimes(1);
  });

  it("ignores a duplicate delivery: the second call does nothing", async () => {
    const { store, rows, cache } = setup();
    const handler = vi.fn();
    const deps = { store, cache, resolveHandler: () => handler };

    expect((await processWebhook(deps, delivery("dup"))).status).toBe(200);
    expect((await processWebhook(deps, delivery("dup"))).status).toBe(200);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it("acknowledges unsupported topics with 200 and no database write", async () => {
    const { store, rows, cache } = setup();
    const response = await processWebhook(
      { store, cache },
      delivery("wh-x", "CUSTOMERS_CREATE"),
    );
    expect(response.status).toBe(200);
    expect(rows).toHaveLength(0);
    expect(cache.get(SHOP, productKey)).toBe("cached");
  });

  it("returns 500 on handler failure, releases the id, and processes the retry", async () => {
    const { store, rows, cache } = setup();
    const handler = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementationOnce(() => {});
    const deps = { store, cache, resolveHandler: () => handler };

    const first = await processWebhook(deps, delivery("retry-me"));
    expect(first.status).toBe(500);
    expect(rows).toHaveLength(0);

    const retry = await processWebhook(deps, delivery("retry-me"));
    expect(retry.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
  });

  it("still returns 200 when the opportunistic cleanup fails", async () => {
    const { store, cache } = setup();
    const maybeCleanup = vi.fn(async () => {
      throw new Error("db down");
    });
    const response = await processWebhook(
      { store, cache, maybeCleanup },
      delivery(),
    );
    expect(response.status).toBe(200);
  });

  it("passes product events to the storefront notifier", async () => {
    const { store, cache } = setup();
    const notifyStorefront = vi.fn();
    await processWebhook({ store, cache, notifyStorefront }, delivery());
    expect(notifyStorefront).toHaveBeenCalledWith({
      topic: "products/update",
      productId: "42",
      handle: "hoodie",
    });
  });
});
