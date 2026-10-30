/**
 * Inventory Risk data: the cached summary (bounded sample) plus live,
 * cursor-paginated table pages.
 */

import type { TaggedCache } from "../cache/types";
import { inventorySummaryKey, keyTags } from "../cache/keys";
import { INVENTORY_SAMPLE_CAP } from "../config";
import type { RiskLevel, VariantRisk } from "../inventory-risk";
import { classifyVariant, summarizeInventory } from "../inventory-risk";
import type { AdminGraphqlClient } from "../shopify/client";
import type {
  InventoryPage,
  InventoryPageRequest,
} from "../shopify/inventory.server";
import {
  getInventoryPage,
  getInventorySample,
} from "../shopify/inventory.server";

export type InventoryRiskSummary = {
  sampleSize: number;
  capped: boolean;
  counts: Record<RiskLevel, number>;
  topAtRisk: VariantRisk[];
  /**
   * Variant id -> "critical" | "low" for every at-risk variant in the sample.
   * The sample is sorted least stock first, so it covers at-risk variants
   * before healthy ones. Used by Order Operations' low-stock cross-check.
   */
  atRiskByVariantId: Record<string, "critical" | "low">;
};

export async function loadInventorySummary(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  cap: number = INVENTORY_SAMPLE_CAP,
): Promise<InventoryRiskSummary> {
  return cache.getOrLoad(
    shop,
    inventorySummaryKey,
    { tags: keyTags.inventorySummary(shop) },
    async () => {
      const { variants, capped } = await getInventorySample(client, cap);
      const risks = variants.map((v) => classifyVariant(v));
      const summary = summarizeInventory(risks);
      const atRiskByVariantId: Record<string, "critical" | "low"> = {};
      for (const r of risks) {
        if (r.risk === "critical" || r.risk === "low") {
          atRiskByVariantId[r.variant.variantId] = r.risk;
        }
      }
      return {
        sampleSize: summary.total,
        capped,
        counts: summary.counts,
        topAtRisk: summary.topAtRisk,
        atRiskByVariantId,
      };
    },
  );
}

/** One live table page, classified (at the filtered location if any). */
export async function loadInventoryPage(
  client: AdminGraphqlClient,
  request: InventoryPageRequest,
): Promise<{ rows: VariantRisk[]; pageInfo: InventoryPage["pageInfo"] }> {
  const page = await getInventoryPage(client, request);
  return {
    rows: page.variants.map((v) =>
      classifyVariant(v, { locationId: request.locationId ?? null }),
    ),
    pageInfo: page.pageInfo,
  };
}
