/**
 * The app-wide cache instance. To move to a shared store (e.g. Redis) for
 * multi-instance hosting, implement `TaggedCache` and swap it here.
 */

import { MemoryTaggedCache } from "./memory-cache";
import type { TaggedCache } from "./types";

declare global {
  // Survives dev-server module reloads, like the Prisma client.
  // eslint-disable-next-line no-var
  var zjAppCache: TaggedCache | undefined;
}

export const appCache: TaggedCache = (globalThis.zjAppCache ??=
  new MemoryTaggedCache());

export { cacheKey, cacheTags } from "./types";
export type { CacheKey, TaggedCache } from "./types";
