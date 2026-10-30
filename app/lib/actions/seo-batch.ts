/**
 * "Apply suggested SEO" batch planning: capped at SEO_BATCH_MAX products, and
 * only fills fields that are missing (existing SEO values are kept).
 */

import { SEO_BATCH_MAX } from "../config";
import type { SeoSummary, SeoValues } from "./seo";
import { normalizeText, planSeoUpdate, suggestSeo } from "./seo";
import type { FieldError } from "./types";

export type SeoBatchProduct = {
  id: string;
  title: string;
  vendor: string;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type SeoBatchItem = {
  productId: string;
  productTitle: string;
  valid: boolean;
  errors: FieldError[];
  /** Values to apply (existing non-empty values are kept as is). */
  values: SeoValues;
  /** What the merchant saw; sent back for the stale-data check. */
  expected: { title: string; description: string };
  summary: SeoSummary;
};

export function planSeoBatch(
  products: readonly SeoBatchProduct[],
  max: number = SEO_BATCH_MAX,
): { items: SeoBatchItem[]; skipped: number } {
  const items = products.slice(0, max).map((p): SeoBatchItem => {
    const currentTitle = normalizeText(p.seoTitle ?? "");
    const currentDescription = normalizeText(p.seoDescription ?? "");
    const suggestion = suggestSeo(p);
    const next = {
      title: currentTitle || suggestion.title,
      description: currentDescription || suggestion.description,
    };
    const plan = planSeoUpdate({
      current: { title: currentTitle, description: currentDescription },
      next,
    });
    return {
      productId: p.id,
      productTitle: p.title || "(untitled)",
      valid: plan.valid,
      errors: plan.errors,
      values: plan.values,
      expected: { title: currentTitle, description: currentDescription },
      summary: plan.summary,
    };
  });
  return { items, skipped: Math.max(0, products.length - max) };
}
