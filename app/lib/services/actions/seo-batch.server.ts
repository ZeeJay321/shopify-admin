/**
 * "Apply suggested SEO" for up to SEO_BATCH_MAX products.
 *
 * preview_seo_batch (no mutation): re-reads each product and plans
 *   suggestions that only fill missing fields.
 * apply_seo_batch (confirmed): applies the exact values the merchant saw,
 *   one product at a time through the single SEO action, with per-product
 *   results. Not all-or-nothing; stops early only if Shopify throttles.
 */

import type { BatchOutcome, SeoBatchProduct } from "../../actions";
import { planSeoBatch } from "../../actions";
import { SEO_BATCH_MAX } from "../../config";
import { isShopifyApiError } from "../../shopify/errors";
import { toNumericId, toProductGid } from "../../shopify/gid";
import { getProduct } from "../../shopify/products.server";
import { applySeoUpdate } from "./product.server";
import type { IntentHandler } from "./run.server";
import { failure, success } from "./run.server";

export const previewSeoBatchHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: false,
  async run(ctx) {
    const ids = [...new Set(ctx.form.getAll("productId").map(String))];
    if (ids.length === 0) return failure(ctx.intent, 400, "validation");
    const gids = ids.slice(0, SEO_BATCH_MAX).map(toProductGid);

    const products: SeoBatchProduct[] = [];
    for (const gid of gids) {
      try {
        const record = await getProduct(ctx.client, gid);
        products.push({
          id: toNumericId(gid),
          title: record.snapshot.title,
          vendor: record.vendor,
          description: record.snapshot.description,
          seoTitle: record.snapshot.seoTitle,
          seoDescription: record.snapshot.seoDescription,
        });
      } catch (error) {
        // A deleted product is skipped; anything else (throttling,
        // permission) aborts the preview.
        if (!isShopifyApiError(error) || error.kind !== "not_found")
          throw error;
      }
    }

    const { items } = planSeoBatch(products);
    return success(
      ctx.intent,
      `Review ${items.length} suggested SEO updates.`,
      undefined,
      {
        preview: items,
        skipped: Math.max(0, ids.length - SEO_BATCH_MAX),
      },
    );
  },
};

type BatchInput = {
  productId: string;
  productTitle: string;
  title: string;
  description: string;
  expectedTitle: string;
  expectedDescription: string;
};

export function parseBatchItems(raw: string): BatchInput[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const items: BatchInput[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const fields = [
      "productId",
      "title",
      "description",
      "expectedTitle",
      "expectedDescription",
    ] as const;
    if (!fields.every((f) => typeof record[f] === "string")) return null;
    items.push({
      productId: String(record.productId),
      productTitle:
        typeof record.productTitle === "string"
          ? record.productTitle
          : String(record.productId),
      title: String(record.title),
      description: String(record.description),
      expectedTitle: String(record.expectedTitle),
      expectedDescription: String(record.expectedDescription),
    });
  }
  return items;
}

export const applySeoBatchHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: true,
  async run(ctx) {
    const items = parseBatchItems(String(ctx.form.get("items") ?? ""));
    if (!items || items.length === 0 || items.length > SEO_BATCH_MAX) {
      return failure(ctx.intent, 400, "validation", {
        fieldErrors: [
          {
            field: "form",
            message: `Select between 1 and ${SEO_BATCH_MAX} products.`,
          },
        ],
      });
    }

    const results: BatchOutcome[] = [];
    let throttled = false;
    for (const item of items) {
      if (throttled) {
        results.push({
          productId: item.productId,
          productTitle: item.productTitle,
          ok: false,
          message: "Not attempted: Shopify was busy. Try again.",
        });
        continue;
      }
      try {
        const outcome = await applySeoUpdate(ctx, item);
        results.push({
          productId: item.productId,
          productTitle: item.productTitle,
          ok: outcome.result.ok,
          message: outcome.result.message,
        });
      } catch (error) {
        if (!isShopifyApiError(error)) throw error;
        throttled = error.kind === "throttled";
        results.push({
          productId: item.productId,
          productTitle: item.productTitle,
          ok: false,
          message: throttled
            ? "Shopify was busy. Try again."
            : "Couldn't update this product.",
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return success(
      ctx.intent,
      `Updated SEO for ${okCount} of ${results.length} products.`,
      `${results.length} products`,
      { results },
    );
  },
};
