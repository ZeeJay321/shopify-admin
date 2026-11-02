/**
 * Built-in storefront readiness checks. Weights total 100.
 *
 * "Live" products = status ACTIVE (what a storefront can sell).
 *
 * | Group       | Check                     | Severity | Weight |
 * |-------------|---------------------------|----------|--------|
 * | Products    | Titles present            | critical | 10     |
 * | Products    | No placeholder titles     | warning  | 5      |
 * | Products    | Descriptions              | warning  | 10     |
 * | Products    | At least one image        | critical | 10     |
 * | Variants    | Prices above 0            | critical | 15     |
 * | Variants    | Not out of stock only     | warning  | 10     |
 * | SEO         | SEO titles                | info     | 5      |
 * | SEO         | SEO descriptions          | info     | 5      |
 * | Publishing  | Handles                   | critical | 5      |
 * | Publishing  | Published to sales channel| critical | 10     |
 * | Collections | Collections exist, non-empty | warning | 5     |
 * | Collections | Products in a collection  | warning  | 10     |
 *
 * Product checks score the share of live products that pass.
 */

import { MIN_DESCRIPTION_LENGTH, isPlaceholderTitle } from "../product-health";
import type {
  AffectedResource,
  CheckConfig,
  CheckEvaluation,
  ReadinessCollection,
  ReadinessProduct,
  StorefrontCheck,
  StorefrontSnapshot,
} from "./types";

export function liveProducts(snapshot: StorefrontSnapshot): ReadinessProduct[] {
  return snapshot.products.filter((p) => p.status === "ACTIVE");
}

export function productResource(
  p: ReadinessProduct,
  problem?: string,
): AffectedResource {
  return {
    kind: "product",
    id: p.id,
    title: p.title || "(untitled)",
    handle: p.handle,
    ...(problem ? { problem } : {}),
  };
}

function collectionResource(c: ReadinessCollection): AffectedResource {
  return { kind: "collection", id: c.id, title: c.title, handle: c.handle };
}

/** Share of live products passing `ok`; N/A when there are none. */
export function liveProductRatio(
  snapshot: StorefrontSnapshot,
  ok: (p: ReadinessProduct) => boolean,
  problem?: string | ((p: ReadinessProduct) => string),
): CheckEvaluation {
  const live = liveProducts(snapshot);
  if (live.length === 0) return { score: null, affectedResources: [] };
  const failing = live.filter((p) => !ok(p));
  return {
    score: (live.length - failing.length) / live.length,
    affectedResources: failing.map((p) =>
      productResource(p, typeof problem === "function" ? problem(p) : problem),
    ),
  };
}

const hasTitle: StorefrontCheck = {
  id: "product_titles",
  name: "Products have titles",
  description:
    "Every live product needs a title to be listed on the storefront.",
  group: "products",
  severity: "critical",
  weight: 10,
  evaluate: (s) =>
    liveProductRatio(s, (p) => p.title.trim() !== "", "Missing title"),
};

const noPlaceholderTitles: StorefrontCheck = {
  id: "placeholder_titles",
  name: "No placeholder titles",
  description:
    'Titles like "Untitled" or "Test product" look unfinished to shoppers.',
  group: "products",
  severity: "warning",
  weight: 5,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) => !isPlaceholderTitle(p.title),
      (p) => `Placeholder title "${p.title}"`,
    ),
};

const descriptions: StorefrontCheck = {
  id: "descriptions",
  name: "Products have descriptions",
  description: `Live products need a description of at least ${MIN_DESCRIPTION_LENGTH} characters.`,
  group: "products",
  severity: "warning",
  weight: 10,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) => p.description.trim().length >= MIN_DESCRIPTION_LENGTH,
      (p) =>
        p.description.trim() === ""
          ? "No description"
          : `Description is ${p.description.trim().length} characters`,
    ),
};

const images: StorefrontCheck = {
  id: "images",
  name: "Products have an image",
  description:
    "Live products need at least one image for product cards and pages.",
  group: "products",
  severity: "critical",
  weight: 10,
  evaluate: (s) => liveProductRatio(s, (p) => p.imageCount > 0, "No images"),
};

const prices: StorefrontCheck = {
  id: "variant_prices",
  name: "Variants have prices",
  description: "Every variant of a live product needs a price above 0.",
  group: "variants",
  severity: "critical",
  weight: 15,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) =>
        p.variants.length > 0 &&
        p.variants.every((v) => v.price !== null && v.price > 0),
      "A variant has no price or a price of 0",
    ),
};

const notOutOfStockOnly: StorefrontCheck = {
  id: "out_of_stock_only",
  name: "Live products can be bought",
  description:
    "Live products whose tracked variants are all out of stock show as sold out.",
  group: "variants",
  severity: "warning",
  weight: 10,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) =>
        p.variants.length === 0 ||
        p.variants.some((v) => !v.tracked || (v.inventoryQuantity ?? 0) > 0),
      "Every tracked variant is out of stock",
    ),
};

const seoTitles: StorefrontCheck = {
  id: "seo_titles",
  name: "SEO titles",
  description: "Live products should set a search engine page title.",
  group: "seo",
  severity: "info",
  weight: 5,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) => (p.seoTitle ?? "").trim() !== "",
      "No SEO title",
    ),
};

const seoDescriptions: StorefrontCheck = {
  id: "seo_descriptions",
  name: "SEO descriptions",
  description: "Live products should set a search engine meta description.",
  group: "seo",
  severity: "info",
  weight: 5,
  evaluate: (s) =>
    liveProductRatio(
      s,
      (p) => (p.seoDescription ?? "").trim() !== "",
      "No SEO description",
    ),
};

const handles: StorefrontCheck = {
  id: "handles",
  name: "Products have handles",
  description: "Storefront URLs are built from the product handle.",
  group: "publishing",
  severity: "critical",
  weight: 5,
  evaluate: (s) =>
    liveProductRatio(s, (p) => p.handle.trim() !== "", "Missing handle"),
};

/**
 * Publishing: checks the configured sales channel (e.g. a headless
 * storefront's channel) when one is given, else Online Store via its URL.
 * The id stays "online_store" so stored links and tests keep working.
 */
const onlineStore: StorefrontCheck = {
  id: "online_store",
  name: "Published to the Online Store",
  description:
    "Live products should be published to the Online Store sales channel.",
  group: "publishing",
  severity: "critical",
  weight: 10,
  describe: (config: CheckConfig) =>
    config.channel
      ? {
          name: `Published to ${config.channel.name}`,
          description: `Live products should be published to the ${config.channel.name} sales channel.`,
        }
      : {
          name: "Published to the Online Store",
          description:
            "Live products should be published to the Online Store sales channel.",
        },
  evaluate: (s, config) => {
    const channel = config?.channel ?? null;
    if (!channel) {
      return liveProductRatio(
        s,
        (p) => p.publishedToOnlineStore,
        "Not published to Online Store",
      );
    }
    // Unknown publication state (flags couldn't be read): not applicable.
    if (
      liveProducts(s).some((p) => typeof p.publishedToChannel !== "boolean")
    ) {
      return { score: null, affectedResources: [] };
    }
    return liveProductRatio(
      s,
      (p) => p.publishedToChannel === true,
      `Not published to ${channel.name}`,
    );
  },
};

const collectionsNonEmpty: StorefrontCheck = {
  id: "collections_non_empty",
  name: "Collections exist and have products",
  description:
    "Storefront navigation needs at least one collection, and empty collections lead nowhere.",
  group: "collections",
  severity: "warning",
  weight: 5,
  evaluate: (s) => {
    if (s.collections === null) return { score: null, affectedResources: [] };
    if (s.collections.length === 0) return { score: 0, affectedResources: [] };
    const empty = s.collections.filter((c) => c.productCount === 0);
    return {
      score: (s.collections.length - empty.length) / s.collections.length,
      affectedResources: empty.map(collectionResource),
    };
  },
};

const productsInCollections: StorefrontCheck = {
  id: "products_in_collections",
  name: "Products belong to a collection",
  description:
    "Products outside every collection are hard to find from navigation.",
  group: "collections",
  severity: "warning",
  weight: 10,
  evaluate: (s) => {
    const live = liveProducts(s);
    if (live.some((p) => p.inAnyCollection === null)) {
      return { score: null, affectedResources: [] };
    }
    return liveProductRatio(s, (p) => p.inAnyCollection === true);
  },
};

export const DEFAULT_CHECKS: readonly StorefrontCheck[] = [
  hasTitle,
  noPlaceholderTitles,
  descriptions,
  images,
  prices,
  notOutOfStockOnly,
  seoTitles,
  seoDescriptions,
  handles,
  onlineStore,
  collectionsNonEmpty,
  productsInCollections,
];
