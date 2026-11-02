/** Storefront readiness types (pure; no Shopify or UI imports). */

import type { ProductSnapshot } from "../product-health/types";

/** Phase 1 product snapshot plus what readiness needs. `id` is numeric. */
export type ReadinessProduct = ProductSnapshot & {
  handle: string;
  /** null when membership couldn't be loaded. */
  inAnyCollection: boolean | null;
  /**
   * Published to the checked sales channel (CheckConfig.channel); null when
   * unknown. Unset when no channel is configured.
   */
  publishedToChannel?: boolean | null;
};

/** A sales channel (publication) the merchant can check against. */
export type SalesChannel = {
  /** Publication GID. */
  id: string;
  name: string;
  isOnlineStore: boolean;
  /** Products included in the publication (Shopify's count). */
  productCount: number;
  atLeast: boolean;
};

/** Per-run configuration handed to every check. */
export type CheckConfig = {
  /** Channel for the publishing check; null = Online Store (by URL). */
  channel: { id: string; name: string } | null;
};

export type ReadinessCollection = {
  id: string;
  title: string;
  handle: string;
  productCount: number;
};

export type StorefrontSnapshot = {
  products: ReadinessProduct[];
  productsCapped: boolean;
  /** null when collections couldn't be loaded (checks become N/A). */
  collections: ReadinessCollection[] | null;
  collectionsCapped: boolean;
};

export type AffectedResource = {
  kind: "product" | "collection";
  id: string;
  title: string;
  handle: string;
  /** What's wrong for this resource, e.g. "No SEO description". */
  problem?: string;
};

export type ReadinessGroup =
  "products" | "variants" | "seo" | "collections" | "publishing";

export type CheckSeverity = "critical" | "warning" | "info";

export type CheckEvaluation = {
  /** 0..1, or null when the check doesn't apply (e.g. no live products). */
  score: number | null;
  affectedResources: AffectedResource[];
};

/** Add a check by creating one of these and registering it. */
export type StorefrontCheck = {
  id: string;
  name: string;
  description: string;
  group: ReadinessGroup;
  severity: CheckSeverity;
  weight: number;
  evaluate(snapshot: StorefrontSnapshot, config?: CheckConfig): CheckEvaluation;
  /** Optional config-dependent name/description (e.g. the channel name). */
  describe?(config: CheckConfig): { name: string; description: string };
};

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

export type CheckResult = {
  id: string;
  name: string;
  description: string;
  group: ReadinessGroup;
  severity: CheckSeverity;
  weight: number;
  status: CheckStatus;
  score: number | null;
  affectedCount: number;
  /** Capped list (READINESS_AFFECTED_LIMIT). */
  affectedResources: AffectedResource[];
};

export type ReadinessReport = {
  /** 0-100 weighted over applicable checks; null if nothing applies. */
  score: number | null;
  checks: CheckResult[];
  liveProductCount: number;
  productCount: number;
  productsCapped: boolean;
  collectionCount: number | null;
  collectionsCapped: boolean;
  /** Display rows for affected products, keyed by numeric id (phase 6). */
  productIndex?: Record<string, ReadinessProductRow>;
};

/** What the affected-products table shows for one product. */
export type ReadinessProductRow = {
  id: string;
  /** As stored in Shopify (may be empty). */
  title: string;
  handle: string;
  vendor: string;
  status: string;
  imageUrl: string | null;
  score: number;
  /** Plain-text description, for the Edit dialog. */
  description: string;
};
