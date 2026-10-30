/**
 * Builds the compact health summary served to the Admin UI extensions.
 * Reuses the data layer (getProduct) and scoring library; no new logic.
 */

import type { CachedProductHealth } from "../cache/keys";
import { keyTags, productHealthKey } from "../cache/keys";
import type { TaggedCache } from "../cache/types";
import { scoreProduct, scoreTone, summarizeGroups } from "../product-health";
import type { AdminGraphqlClient } from "../shopify/client";
import type { ShopifyApiErrorKind } from "../shopify/errors";
import { isShopifyApiError, toMerchantMessage } from "../shopify/errors";
import { toNumericId, toProductGid } from "../shopify/gid";
import { getProduct } from "../shopify/products.server";
import type {
  HealthErrorCode,
  HealthResponse,
  HealthSummaryIssue,
} from "./contract";
import { TOP_ISSUES_LIMIT } from "./contract";

export type HealthSummaryResult = {
  status: number;
  body: HealthResponse;
  headers?: Record<string, string>;
};

/** Seconds the client should wait before retrying a throttled request. */
export const THROTTLED_RETRY_AFTER_SECONDS = 5;

const ERROR_STATUS: Record<
  ShopifyApiErrorKind,
  { status: number; code: HealthErrorCode }
> = {
  invalid_id: { status: 400, code: "invalid_id" },
  not_found: { status: 404, code: "not_found" },
  access_denied: { status: 403, code: "access_denied" },
  throttled: { status: 429, code: "throttled" },
  graphql: { status: 502, code: "upstream" },
  http: { status: 502, code: "upstream" },
  user_errors: { status: 502, code: "upstream" },
};

export type HealthSummaryCache = { shop: string; cache: TaggedCache };

/**
 * Validates the id, then loads and scores the product. With `cached`, reads
 * through the cache; entries are tagged with the product id and its
 * inventory item ids so product and inventory webhooks invalidate them.
 */
export async function loadHealthSummary(
  client: AdminGraphqlClient,
  idParam: string | undefined,
  cached?: HealthSummaryCache,
): Promise<HealthSummaryResult> {
  try {
    const gid = toProductGid(idParam);
    const productId = toNumericId(gid);
    const load = () => buildSummary(client, gid);
    const { summary } = cached
      ? await cached.cache.getOrLoad(
          cached.shop,
          productHealthKey(productId),
          {
            tags: (value) =>
              keyTags.productHealth(
                cached.shop,
                productId,
                value.inventoryItemIds,
              ),
          },
          load,
        )
      : await load();

    return { status: 200, body: summary };
  } catch (error) {
    if (!isShopifyApiError(error)) throw error;
    console.warn(`[product-health-api] ${error.kind}: ${error.message}`);

    const { status, code } = ERROR_STATUS[error.kind];
    const { title, message } = toMerchantMessage(error);
    return {
      status,
      body: { ok: false, error: { code, title, message } },
      headers:
        status === 429
          ? { "Retry-After": String(THROTTLED_RETRY_AFTER_SECONDS) }
          : undefined,
    };
  }
}

async function buildSummary(
  client: AdminGraphqlClient,
  gid: string,
): Promise<CachedProductHealth> {
  const record = await getProduct(client, gid);
  const health = scoreProduct(record.snapshot);
  const id = toNumericId(record.snapshot.id);

  const topIssues: HealthSummaryIssue[] = health.issues
    .slice(0, TOP_ISSUES_LIMIT)
    .map((issue) => ({
      id: issue.id,
      label: issue.label,
      status: issue.status === "fail" ? "fail" : "warn",
      message: issue.message,
    }));

  return {
    inventoryItemIds: record.inventoryItemIds,
    summary: {
      ok: true,
      product: { id, title: record.snapshot.title },
      score: health.score,
      scoreTone: scoreTone(health.score),
      issueCount: health.issues.length,
      groups: summarizeGroups(health).map((g) => ({
        id: g.id,
        label: g.label,
        status: g.status,
        issueCount: g.issueCount,
      })),
      topIssues,
      reportPath: `/app/products/${id}`,
    },
  };
}
