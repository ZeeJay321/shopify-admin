/**
 * Store Health data: product counts and the scored product sample, read
 * through the cache (invalidated by product and inventory webhooks).
 */

import type { TaggedCache } from "../cache/types";
import { keyTags, storeCountsKey, storeHealthSampleKey } from "../cache/keys";
import { HEALTH_SAMPLE_CAP } from "../config";
import type { IssueCount } from "../product-health";
import {
  aggregateStoreHealth,
  scoreProduct,
  topIssues,
} from "../product-health";
import type { AdminGraphqlClient } from "../shopify/client";
import type { StoreCounts } from "../shopify/products.server";
import { getProductSample, getStoreCounts } from "../shopify/products.server";

export type StoreHealthSample = {
  size: number;
  capped: boolean;
  averageScore: number | null;
  productsWithIssues: number;
  topIssues: IssueCount[];
};

export async function loadStoreHealth(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
): Promise<{ counts: StoreCounts; sample: StoreHealthSample }> {
  const [counts, sample] = await Promise.all([
    cache.getOrLoad(
      shop,
      storeCountsKey,
      { tags: keyTags.storeCounts(shop) },
      () => getStoreCounts(client),
    ),
    cache.getOrLoad(
      shop,
      storeHealthSampleKey,
      { tags: keyTags.storeHealthSample(shop) },
      () => loadSample(client),
    ),
  ]);
  return { counts, sample };
}

async function loadSample(
  client: AdminGraphqlClient,
): Promise<StoreHealthSample> {
  const sample = await getProductSample(client, HEALTH_SAMPLE_CAP);
  const health = aggregateStoreHealth(
    sample.products.map((p) => scoreProduct(p.snapshot)),
  );
  return {
    size: health.sampleSize,
    capped: sample.capped,
    averageScore: health.averageScore,
    productsWithIssues: health.productsWithIssues,
    topIssues: topIssues(health, 5),
  };
}
