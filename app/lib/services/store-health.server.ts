/**
 * Store Health data: product counts and the scored product sample, read
 * through the cache (invalidated by product and inventory webhooks).
 */

import type { TaggedCache } from "../cache/types";
import { keyTags, storeCountsKey, storeHealthSampleKey } from "../cache/keys";
import { HEALTH_SAMPLE_CAP } from "../config";
import type { IssueCount } from "../product-health";
import {
  GROUPS,
  aggregateStoreHealth,
  bucketScores,
  scoreProduct,
  summarizeGroups,
  topIssues,
} from "../product-health";
import type { CheckGroup } from "../product-health/types";
import type { AdminGraphqlClient } from "../shopify/client";
import type { StoreCounts } from "../shopify/products.server";
import { getProductSample, getStoreCounts } from "../shopify/products.server";

export type StoreHealthSample = {
  size: number;
  capped: boolean;
  averageScore: number | null;
  productsWithIssues: number;
  topIssues: IssueCount[];
  /** Average points earned per group across the sample (for the breakdown). */
  groupAverages: Array<{
    id: CheckGroup;
    label: string;
    earned: number;
    weight: number;
  }>;
  /** Product count per SCORE_BUCKETS band (for the distribution chart). */
  scoreBuckets: number[];
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
  const results = sample.products.map((p) => scoreProduct(p.snapshot));
  const health = aggregateStoreHealth(results);
  const groupTotals = new Map<CheckGroup, number>();
  for (const result of results) {
    for (const g of summarizeGroups(result)) {
      groupTotals.set(g.id, (groupTotals.get(g.id) ?? 0) + g.earned);
    }
  }
  const groupAverages = GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    weight: g.weight,
    earned: results.length
      ? Math.round(((groupTotals.get(g.id) ?? 0) / results.length) * 10) / 10
      : 0,
  }));
  return {
    size: health.sampleSize,
    capped: sample.capped,
    averageScore: health.averageScore,
    productsWithIssues: health.productsWithIssues,
    topIssues: topIssues(health, 5),
    groupAverages,
    scoreBuckets: bucketScores(results.map((r) => r.score)),
  };
}
