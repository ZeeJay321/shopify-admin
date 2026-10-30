/**
 * Plain input/output types for product health scoring.
 * Deliberately free of Shopify API and UI types.
 */

export type VariantSnapshot = {
  title: string;
  /** Parsed price; null when missing or unparseable. */
  price: number | null;
  /** null when Shopify doesn't report a quantity. */
  inventoryQuantity: number | null;
  /** Whether Shopify tracks inventory for this variant. */
  tracked: boolean;
};

export type ProductOptionSnapshot = {
  name: string;
  values: string[];
};

export type ProductSnapshot = {
  id: string;
  title: string;
  /** Shopify ProductStatus, e.g. ACTIVE, DRAFT, ARCHIVED. */
  status: string;
  /** Plain-text description (HTML stripped). */
  description: string;
  imageCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  options: ProductOptionSnapshot[];
  /** The variants that were fetched (may be fewer than variantCount). */
  variants: VariantSnapshot[];
  /** Total variants on the product. */
  variantCount: number;
  publishedToOnlineStore: boolean;
};

export type CheckGroup =
  "content" | "seo" | "variants" | "inventory" | "publishing";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckId =
  | "title"
  | "description"
  | "images"
  | "seo_title"
  | "seo_description"
  | "variant_prices"
  | "variant_options"
  | "out_of_stock"
  | "low_stock"
  | "status_active"
  | "online_store";

export type HealthCheck = {
  id: CheckId;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  /** Max points for this check. */
  weight: number;
  /** Points earned, 0..weight. */
  earned: number;
  message: string;
  /** Exact manual step to fix it in Shopify Admin (empty when passing). */
  fix: string;
};

export type ProductHealth = {
  /** 0-100, integer. */
  score: number;
  checks: HealthCheck[];
  /** Checks that are not `pass`. */
  issues: HealthCheck[];
};

export type ScoreOptions = {
  lowStockThreshold?: number;
};
