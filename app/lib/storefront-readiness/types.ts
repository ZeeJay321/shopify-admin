/** Storefront readiness types (pure; no Shopify or UI imports). */

import type { ProductSnapshot } from "../product-health/types";

/** Phase 1 product snapshot plus what readiness needs. `id` is numeric. */
export type ReadinessProduct = ProductSnapshot & {
  handle: string;
  /** null when membership couldn't be loaded. */
  inAnyCollection: boolean | null;
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
  evaluate(snapshot: StorefrontSnapshot): CheckEvaluation;
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
};
