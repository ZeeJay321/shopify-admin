/**
 * Sales channels for the app (phase 6+): the channel list (cached, needs
 * read_publications) and the extra channel Product Health scoring accepts
 * besides Online Store. One server-side rule, so the app pages and the
 * Admin extensions always score the same product the same way.
 */

import type { TaggedCache } from "../cache/types";
import { keyTags, salesChannelsKey } from "../cache/keys";
import type { AdminGraphqlClient } from "../shopify/client";
import { isShopifyApiError } from "../shopify/errors";
import { getSalesChannels } from "../shopify/publications.server";
import type { ScoringChannel } from "../shopify/snapshot";
import { scoringChannel } from "../storefront-readiness/channel";
import type { SalesChannel } from "../storefront-readiness/types";

/** Sales channels, or null when read_publications isn't granted. */
export async function loadSalesChannels(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
): Promise<SalesChannel[] | null> {
  try {
    return await cache.getOrLoad(
      shop,
      salesChannelsKey,
      { tags: keyTags.salesChannels(shop) },
      () => getSalesChannels(client),
    );
  } catch (error) {
    if (!isShopifyApiError(error) || error.kind !== "access_denied") {
      throw error;
    }
    return null;
  }
}

export type ScoringChannelResult = {
  /** Accepted besides Online Store; null = Online Store only. */
  channel: ScoringChannel | null;
  /** read_publications isn't granted (show the permission banner). */
  scopeMissing: boolean;
};

/**
 * The scoring channel for this shop. Channel info is an enhancement: if it
 * can't be read (other than throttling), scoring falls back to Online Store
 * only instead of failing the page.
 */
export async function resolveScoringChannel(
  client: AdminGraphqlClient,
  shop: string,
  cache: TaggedCache,
): Promise<ScoringChannelResult> {
  try {
    const channels = await loadSalesChannels(client, shop, cache);
    if (channels === null) return { channel: null, scopeMissing: true };
    const chosen = scoringChannel(channels);
    return {
      channel: chosen ? { id: chosen.id, name: chosen.name } : null,
      scopeMissing: false,
    };
  } catch (error) {
    if (!isShopifyApiError(error) || error.kind === "throttled") throw error;
    console.warn(`[sales-channels] Unavailable for scoring: ${error.kind}`);
    return { channel: null, scopeMissing: false };
  }
}
