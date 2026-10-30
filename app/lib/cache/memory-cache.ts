/**
 * In-memory TaggedCache. Per server instance: on multi-instance or
 * serverless hosts each instance has its own copy and webhooks only
 * invalidate the instance that received them; use a shared store there.
 */

import { CACHE_MAX_ENTRIES, CACHE_TTL_MS } from "../config";
import type {
  CacheKey,
  CacheSetOptions,
  LoadOptions,
  TaggedCache,
} from "./types";

type Entry = {
  value: unknown;
  expiresAt: number;
  tags: readonly string[];
};

export type MemoryCacheOptions = {
  now?: () => number;
  defaultTtlMs?: number;
  maxEntries?: number;
};

export class MemoryTaggedCache implements TaggedCache {
  private readonly entries = new Map<string, Entry>();
  private readonly tagIndex = new Map<string, Set<string>>();
  /** Last invalidation time per tag, to reject stale in-flight loads. */
  private readonly invalidatedAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.now = options.now ?? Date.now;
    this.defaultTtlMs = options.defaultTtlMs ?? CACHE_TTL_MS;
    this.maxEntries = options.maxEntries ?? CACHE_MAX_ENTRIES;
  }

  get<T>(shop: string, key: CacheKey<T>): T | undefined {
    const id = entryId(shop, key);
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(id);
      return undefined;
    }
    // Values are only ever written through set<T> with the same typed key.
    return entry.value as T;
  }

  set<T>(
    shop: string,
    key: CacheKey<T>,
    value: T,
    options: CacheSetOptions,
  ): void {
    const id = entryId(shop, key);
    this.delete(id);
    this.entries.set(id, {
      value,
      expiresAt: this.now() + (options.ttlMs ?? this.defaultTtlMs),
      tags: options.tags,
    });
    for (const tag of options.tags) {
      let ids = this.tagIndex.get(tag);
      if (!ids) {
        ids = new Set();
        this.tagIndex.set(tag, ids);
      }
      ids.add(id);
    }
    this.evictOverflow();
  }

  async getOrLoad<T>(
    shop: string,
    key: CacheKey<T>,
    options: LoadOptions<T>,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get(shop, key);
    if (cached !== undefined) return cached;

    const startedAt = this.now();
    const value = await load();
    const tags =
      typeof options.tags === "function" ? options.tags(value) : options.tags;
    // If a webhook invalidated one of these tags while we were loading, the
    // value may already be stale: return it, but don't cache it.
    const invalidatedMeanwhile = tags.some(
      (tag) => (this.invalidatedAt.get(tag) ?? -Infinity) >= startedAt,
    );
    if (!invalidatedMeanwhile) {
      this.set(shop, key, value, { tags, ttlMs: options.ttlMs });
    }
    return value;
  }

  invalidateTags(tags: readonly string[]): void {
    const at = this.now();
    for (const tag of tags) {
      this.invalidatedAt.set(tag, at);
      const ids = this.tagIndex.get(tag);
      if (!ids) continue;
      for (const id of [...ids]) this.delete(id);
    }
    this.pruneInvalidations(at);
  }

  /** Number of live entries (for tests and diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  private delete(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    for (const tag of entry.tags) {
      const ids = this.tagIndex.get(tag);
      ids?.delete(id);
      if (ids && ids.size === 0) this.tagIndex.delete(tag);
    }
  }

  /** Invalidation marks only matter for loads in flight; keep the map bounded. */
  private pruneInvalidations(now: number): void {
    if (this.invalidatedAt.size <= this.maxEntries) return;
    for (const [tag, at] of this.invalidatedAt) {
      if (now - at > this.defaultTtlMs) this.invalidatedAt.delete(tag);
    }
  }

  private evictOverflow(): void {
    // Map preserves insertion order, so the first keys are the oldest.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.delete(oldest);
    }
  }
}

function entryId(shop: string, key: CacheKey<unknown>): string {
  // NUL can't appear in a shop domain, so "a.com" + "x" never collides with
  // another shop's key.
  return `${shop}\u0000${key.name}`;
}
