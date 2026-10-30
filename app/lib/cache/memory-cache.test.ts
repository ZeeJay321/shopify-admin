import { describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "./memory-cache";
import { cacheKey, cacheTags } from "./types";

const A = "store-a.myshopify.com";
const B = "store-b.myshopify.com";
const countsKey = cacheKey<{ total: number }>("store-counts");

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("MemoryTaggedCache", () => {
  it("sets and gets typed values", () => {
    const cache = new MemoryTaggedCache();
    cache.set(A, countsKey, { total: 3 }, { tags: [cacheTags.products(A)] });
    expect(cache.get(A, countsKey)).toEqual({ total: 3 });
    expect(cache.get(A, cacheKey<number>("missing"))).toBeUndefined();
  });

  it("expires entries after the TTL", () => {
    const c = clock();
    const cache = new MemoryTaggedCache({ now: c.now, defaultTtlMs: 100 });
    cache.set(A, countsKey, { total: 1 }, { tags: [] });
    c.advance(99);
    expect(cache.get(A, countsKey)).toEqual({ total: 1 });
    c.advance(1);
    expect(cache.get(A, countsKey)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("honours a per-entry TTL", () => {
    const c = clock();
    const cache = new MemoryTaggedCache({ now: c.now, defaultTtlMs: 1_000 });
    cache.set(A, countsKey, { total: 1 }, { tags: [], ttlMs: 10 });
    c.advance(10);
    expect(cache.get(A, countsKey)).toBeUndefined();
  });

  it("invalidates every entry carrying a tag, and only those", () => {
    const cache = new MemoryTaggedCache();
    const p1 = cacheKey<string>("product-health:1");
    const p2 = cacheKey<string>("product-health:2");
    cache.set(A, p1, "one", {
      tags: [cacheTags.product(A, "1"), cacheTags.inventory(A)],
    });
    cache.set(A, p2, "two", { tags: [cacheTags.product(A, "2")] });
    cache.set(A, countsKey, { total: 2 }, { tags: [cacheTags.products(A)] });

    cache.invalidateTags([cacheTags.inventory(A)]);

    expect(cache.get(A, p1)).toBeUndefined();
    expect(cache.get(A, p2)).toBe("two");
    expect(cache.get(A, countsKey)).toEqual({ total: 2 });

    // Idempotent: invalidating again (or an unknown tag) is harmless.
    cache.invalidateTags([cacheTags.inventory(A), "shop:x:unknown"]);
    expect(cache.get(A, p2)).toBe("two");
  });

  describe("shop isolation", () => {
    it("never returns Store A's value for Store B", () => {
      const cache = new MemoryTaggedCache();
      cache.set(A, countsKey, { total: 10 }, { tags: [cacheTags.products(A)] });
      expect(cache.get(B, countsKey)).toBeUndefined();

      cache.set(B, countsKey, { total: 99 }, { tags: [cacheTags.products(B)] });
      expect(cache.get(A, countsKey)).toEqual({ total: 10 });
      expect(cache.get(B, countsKey)).toEqual({ total: 99 });
    });

    it("invalidating Store A's tags leaves Store B untouched", () => {
      const cache = new MemoryTaggedCache();
      cache.set(A, countsKey, { total: 10 }, { tags: [cacheTags.products(A)] });
      cache.set(B, countsKey, { total: 99 }, { tags: [cacheTags.products(B)] });

      cache.invalidateTags([cacheTags.products(A)]);

      expect(cache.get(A, countsKey)).toBeUndefined();
      expect(cache.get(B, countsKey)).toEqual({ total: 99 });
    });

    it("does not confuse shops whose names share a prefix", () => {
      const cache = new MemoryTaggedCache();
      cache.set("shop.myshopify.com", countsKey, { total: 1 }, { tags: [] });
      expect(cache.get("shop.myshopify.co", countsKey)).toBeUndefined();
      expect(cacheTags.products("a")).not.toBe(cacheTags.products("a:b"));
    });

    it("isolates getOrLoad results per shop", async () => {
      const cache = new MemoryTaggedCache();
      const load = vi.fn(async () => ({ total: 1 }));
      await cache.getOrLoad(
        A,
        countsKey,
        { tags: [cacheTags.products(A)] },
        load,
      );
      await cache.getOrLoad(
        B,
        countsKey,
        { tags: [cacheTags.products(B)] },
        load,
      );
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe("getOrLoad", () => {
    it("loads once, then serves from cache until invalidated", async () => {
      const cache = new MemoryTaggedCache();
      const load = vi.fn(async () => ({ total: 5 }));
      const tags = [cacheTags.products(A)];

      expect(await cache.getOrLoad(A, countsKey, { tags }, load)).toEqual({
        total: 5,
      });
      expect(await cache.getOrLoad(A, countsKey, { tags }, load)).toEqual({
        total: 5,
      });
      expect(load).toHaveBeenCalledTimes(1);

      cache.invalidateTags(tags);
      await cache.getOrLoad(A, countsKey, { tags }, load);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("does not cache a value whose tag was invalidated during the load", async () => {
      const c = clock();
      const cache = new MemoryTaggedCache({ now: c.now });
      const tags = [cacheTags.inventory(A)];

      const value = await cache.getOrLoad(A, countsKey, { tags }, async () => {
        c.advance(5);
        cache.invalidateTags(tags); // webhook arrives mid-load
        c.advance(5);
        return { total: 1 };
      });

      expect(value).toEqual({ total: 1 });
      expect(cache.get(A, countsKey)).toBeUndefined();
    });

    it("supports tags derived from the loaded value", async () => {
      const cache = new MemoryTaggedCache();
      const key = cacheKey<{ itemIds: string[] }>("product-health:7");
      await cache.getOrLoad(
        A,
        key,
        { tags: (v) => v.itemIds.map((id) => cacheTags.inventoryItem(A, id)) },
        async () => ({ itemIds: ["501"] }),
      );
      expect(cache.get(A, key)).toBeDefined();
      cache.invalidateTags([cacheTags.inventoryItem(A, "501")]);
      expect(cache.get(A, key)).toBeUndefined();
    });

    it("does not cache failed loads", async () => {
      const cache = new MemoryTaggedCache();
      await expect(
        cache.getOrLoad(A, countsKey, { tags: [] }, async () => {
          throw new Error("throttled");
        }),
      ).rejects.toThrow("throttled");
      expect(cache.size).toBe(0);
    });
  });

  it("evicts the oldest entries beyond maxEntries", () => {
    const cache = new MemoryTaggedCache({ maxEntries: 2 });
    for (const n of [1, 2, 3]) {
      cache.set(A, cacheKey<number>(`k${n}`), n, {
        tags: [cacheTags.products(A)],
      });
    }
    expect(cache.size).toBe(2);
    expect(cache.get(A, cacheKey<number>("k1"))).toBeUndefined();
    expect(cache.get(A, cacheKey<number>("k3"))).toBe(3);
  });
});

describe("phase 4 tags", () => {
  it("scopes orders and readiness tags by shop", () => {
    expect(cacheTags.orders(A)).toBe(`shop:${A}:orders`);
    expect(cacheTags.readiness(A)).toBe(`shop:${A}:readiness`);
    expect(cacheTags.orders(A)).not.toBe(cacheTags.orders(B));
  });

  it("invalidates readiness for one shop without touching another or orders", () => {
    const cache = new MemoryTaggedCache();
    const readiness = cacheKey<number>("storefront-readiness");
    const orders = cacheKey<number>("orders-summary");
    for (const shop of [A, B]) {
      cache.set(shop, readiness, 1, { tags: [cacheTags.readiness(shop)] });
      cache.set(shop, orders, 2, { tags: [cacheTags.orders(shop)] });
    }
    cache.invalidateTags([cacheTags.readiness(A)]);
    expect(cache.get(A, readiness)).toBeUndefined();
    expect(cache.get(A, orders)).toBe(2);
    expect(cache.get(B, readiness)).toBe(1);
  });
});
