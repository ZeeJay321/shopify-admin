/**
 * Storefront Readiness data: reuses the phase 1 product sample and adds
 * collections, then runs the pure readiness framework. Cached per checked
 * sales channel under the `readiness` and `publications` tags (invalidated
 * by product, inventory and product_publications webhooks, the "Recheck
 * now" button, and the TTL for collection-only changes).
 *
 * Phase 6: affected lists are no longer capped here (tables page over the
 * full set), and the Publishing check can target any sales channel.
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
import { getPublishedFlags } from "../shopify/publications.server";
import { loadSalesChannels } from "./sales-channels.server";
import { scoreProduct } from "../product-health";
import type { ProductRecord, ScoringChannel } from "../shopify/snapshot";
import type {
  CheckConfig,
  ReadinessCollection,
  ReadinessProduct,
  ReadinessProductRow,
  ReadinessReport,
  SalesChannel,
  StorefrontCheck,
} from "../storefront-readiness";
import { DEFAULT_CHECKS, evaluateReadiness } from "../storefront-readiness";
import type { ChannelChoice } from "../storefront-readiness/channel";
import { chooseChannel, scoringChannel } from "../storefront-readiness/channel";

export { loadSalesChannels };

export async function loadReadiness(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  checks: readonly StorefrontCheck[] = DEFAULT_CHECKS,
  config: CheckConfig = { channel: null },
  /** Channel Product Health scores accept besides Online Store. */
  scoring: ScoringChannel | null = null,
): Promise<ReadinessReport> {
  const key = scoring
    ? `${config.channel?.id ?? "default"}|${scoring.id}`
    : config.channel?.id;
  return cache.getOrLoad(
    shop,
    readinessKey(key),
    { tags: keyTags.readiness(shop) },
    async () => {
      const [products, collections] = await Promise.all([
        getProductSample(client, HEALTH_SAMPLE_CAP, scoring),
        loadCollectionsOrNull(client),
      ]);
      const readinessProducts = products.products.map(toReadinessProduct);
      if (config.channel) {
        const live = readinessProducts.filter((p) => p.status === "ACTIVE");
        const flags = await getPublishedFlags(
          client,
          live.map((p) => p.id),
          config.channel.id,
        );
        for (const p of live) p.publishedToChannel = flags.get(p.id) ?? null;
      }
      const report = evaluateReadiness(
        {
          products: readinessProducts,
          productsCapped: products.capped,
          collections: collections?.collections ?? null,
          collectionsCapped: collections?.capped ?? false,
        },
        checks,
        { affectedLimit: Number.POSITIVE_INFINITY },
        config,
      );
      return { ...report, productIndex: productIndex(products.products) };
    },
  );
}

export type ReadinessView = {
  report: ReadinessReport;
  /** null = read_publications missing (Online Store by URL is used). */
  channels: SalesChannel[] | null;
  choice: ChannelChoice | null;
};

/** Readiness for the requested (or best default) sales channel. */
export async function loadReadinessView(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
  requestedChannelId: string | null,
): Promise<ReadinessView> {
  const channels = await loadSalesChannels(client, shop, cache);
  const choice = channels ? chooseChannel(channels, requestedChannelId) : null;
  const channel = choice?.channel
    ? { id: choice.channel.id, name: choice.channel.name }
    : null;
  const scoring = channels ? scoringChannel(channels) : null;
  const report = await loadReadiness(
    client,
    shop,
    cache,
    DEFAULT_CHECKS,
    { channel },
    scoring ? { id: scoring.id, name: scoring.name } : null,
  );
  return { report, channels, choice };
}

function productIndex(
  records: readonly ProductRecord[],
): Record<string, ReadinessProductRow> {
  const index: Record<string, ReadinessProductRow> = {};
  for (const record of records) {
    const id = productNumericIdOrNull(record.snapshot.id) ?? record.snapshot.id;
    index[id] = {
      id,
      title: record.snapshot.title,
      handle: record.handle,
      vendor: record.vendor,
      status: record.snapshot.status,
      imageUrl: record.imageUrl,
      score: scoreProduct(record.snapshot).score,
      description: record.snapshot.description,
    };
  }
  return index;
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
