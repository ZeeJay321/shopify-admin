/**
 * Cache contract. The app depends only on this interface; the backing store
 * (in-memory today, Redis or similar for multi-instance hosts) is chosen in
 * `index.server.ts`.
 *
 * Every operation takes the shop domain, and every tag embeds it, so data for
 * one shop can never be returned for another.
 */

/** A typed cache key: `CacheKey<StoreCounts>` can only hold StoreCounts. */
export type CacheKey<T> = {
  readonly name: string;
  /** Phantom field that carries the value type; never set at runtime. */
  readonly __type?: T;
};

export function cacheKey<T>(name: string): CacheKey<T> {
  return { name };
}

export type CacheSetOptions = {
  /** Full tag strings, built with `cacheTags` (already shop-scoped). */
  tags: readonly string[];
  ttlMs?: number;
};

export type LoadOptions<T> = {
  tags: readonly string[] | ((value: T) => readonly string[]);
  ttlMs?: number;
};

export interface TaggedCache {
  get<T>(shop: string, key: CacheKey<T>): T | undefined;
  set<T>(
    shop: string,
    key: CacheKey<T>,
    value: T,
    options: CacheSetOptions,
  ): void;
  /**
   * Return the cached value or load, cache and return it. Tags may depend on
   * the loaded value (e.g. a product's inventory item ids).
   */
  getOrLoad<T>(
    shop: string,
    key: CacheKey<T>,
    options: LoadOptions<T>,
    load: () => Promise<T>,
  ): Promise<T>;
  /** Drop every entry carrying any of these tags. Idempotent. */
  invalidateTags(tags: readonly string[]): void;
}

/** Tag builders. Tags always start with the shop, so isolation is structural. */
export const cacheTags = {
  products: (shop: string) => `shop:${shop}:products`,
  product: (shop: string, productId: string) =>
    `shop:${shop}:product:${productId}`,
  inventory: (shop: string) => `shop:${shop}:inventory`,
  orders: (shop: string) => `shop:${shop}:orders`,
  readiness: (shop: string) => `shop:${shop}:readiness`,
  /** Sales channels and what's published to them (phase 6). */
  publications: (shop: string) => `shop:${shop}:publications`,
  /**
   * Lets inventory_levels/update (which only carries an inventory item id)
   * find the product entries that depend on that item, with no API call.
   */
  inventoryItem: (shop: string, inventoryItemId: string) =>
    `shop:${shop}:inventory-item:${inventoryItemId}`,
};
