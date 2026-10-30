/**
 * Storefront Readiness data: reuses the phase 1 product sample and adds
 * collections, then runs the pure readiness framework. Cached under the
 * `readiness` tag (invalidated by product and inventory webhooks, the
 * "Recheck now" button, and the TTL for collection-only changes).
 */

import type { TaggedCache } from "../cache/types";
import { cacheTags } from "../cache/types";
import { keyTags, readinessKey } from "../cache/keys";
import { HEALTH_SAMPLE_CAP } from "../config";
import type { AdminGraphqlClient } from "../shopify/client";
import { getCollections } from "../shopify/collections.server";
import { isShopifyApiError } from "../shopify/errors";
import { productNumericIdOrNull } from "../shopify/gid";
import { getProductSample } from "../shopify/products.server";
import type { ProductRecord } from "../shopify/snapshot";
import type {
  ReadinessCollection,
  ReadinessProduct,
  ReadinessReport,
  StorefrontCheck,
} from "../storefront-readiness";
import { DEFAULT_CHECKS, evaluateReadiness } from "../storefront-readiness";

export async function loadReadiness(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  checks: readonly StorefrontCheck[] = DEFAULT_CHECKS,
): Promise<ReadinessReport> {
  return cache.getOrLoad(
    shop,
    readinessKey,
    { tags: keyTags.readiness(shop) },
    async () => {
      const [products, collections] = await Promise.all([
        getProductSample(client, HEALTH_SAMPLE_CAP),
        loadCollectionsOrNull(client),
      ]);
      return evaluateReadiness(
        {
          products: products.products.map(toReadinessProduct),
          productsCapped: products.capped,
          collections: collections?.collections ?? null,
          collectionsCapped: collections?.capped ?? false,
        },
        checks,
      );
    },
  );
}

/** Drop the cached report so the next load re-runs every check. */
export function invalidateReadiness(shop: string, cache: TaggedCache): void {
  cache.invalidateTags([cacheTags.readiness(shop)]);
}

/** Partial data: if collections can't be read, collection checks become N/A. */
async function loadCollectionsOrNull(
  client: AdminGraphqlClient,
): Promise<{ collections: ReadinessCollection[]; capped: boolean } | null> {
  try {
    return await getCollections(client);
  } catch (error) {
    if (!isShopifyApiError(error) || error.kind === "throttled") throw error;
    console.warn(`[readiness] Collections unavailable: ${error.kind}`);
    return null;
  }
}

export function toReadinessProduct(record: ProductRecord): ReadinessProduct {
  return {
    ...record.snapshot,
    id: productNumericIdOrNull(record.snapshot.id) ?? record.snapshot.id,
    handle: record.handle,
    inAnyCollection: record.inAnyCollection,
  };
}
