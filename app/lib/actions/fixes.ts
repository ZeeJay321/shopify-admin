/**
 * Which inline fix a table row offers for a failing check (pure). Zero
 * prices and missing images deliberately have no direct fix.
 */

import type { CheckId, HealthCheck } from "../product-health/types";
import { criticalIssues } from "./status";

export type FixKind =
  "seo" | "publish" | "activate" | "edit" | "adjust_stock" | "admin_only";

export type Fix = { kind: FixKind; reason?: string };

const ADMIN_REASONS = {
  images: "Images have to be uploaded in Shopify Admin.",
  prices: "Price changes are too risky to make from this app.",
  handle: "Change the URL handle in Shopify Admin (it affects redirects).",
  collection: "Manage collections in Shopify Admin.",
} as const;

/** Storefront readiness check id -> fix. */
export function readinessFix(checkId: string): Fix {
  switch (checkId) {
    case "seo_titles":
    case "seo_descriptions":
      return { kind: "seo" };
    case "online_store":
      return { kind: "publish" };
    case "product_titles":
    case "placeholder_titles":
    case "descriptions":
      return { kind: "edit" };
    case "out_of_stock_only":
      return { kind: "adjust_stock" };
    case "images":
      return { kind: "admin_only", reason: ADMIN_REASONS.images };
    case "variant_prices":
      return { kind: "admin_only", reason: ADMIN_REASONS.prices };
    case "handles":
      return { kind: "admin_only", reason: ADMIN_REASONS.handle };
    default:
      return { kind: "admin_only", reason: ADMIN_REASONS.collection };
  }
}

const PRODUCT_FIXES: Partial<Record<CheckId, FixKind>> = {
  seo_title: "seo",
  seo_description: "seo",
  title: "edit",
  description: "edit",
  out_of_stock: "adjust_stock",
  low_stock: "adjust_stock",
};

/**
 * Fixes for a Product Health row, de-duplicated in display order. Drafts
 * with no critical issues can be activated directly.
 */
export function productFixes(
  status: string,
  checks: readonly HealthCheck[],
): FixKind[] {
  const kinds = new Set<FixKind>();
  for (const check of checks) {
    if (check.status === "pass") continue;
    const kind = PRODUCT_FIXES[check.id];
    if (kind) kinds.add(kind);
    if (check.id === "images" || check.id === "variant_prices") {
      kinds.add("admin_only");
    }
  }
  if (status === "DRAFT" && criticalIssues(checks).length === 0) {
    kinds.add("activate");
  }
  const order: FixKind[] = [
    "activate",
    "edit",
    "seo",
    "adjust_stock",
    "admin_only",
  ];
  return order.filter((k) => kinds.has(k));
}

export function adminOnlyReason(checks: readonly HealthCheck[]): string | null {
  const failing = (id: CheckId) =>
    checks.some((c) => c.id === id && c.status !== "pass");
  if (failing("variant_prices")) return ADMIN_REASONS.prices;
  if (failing("images")) return ADMIN_REASONS.images;
  return null;
}
