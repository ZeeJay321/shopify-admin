/**
 * Product health scoring model (deterministic, no I/O).
 *
 * Total = 100 points across five groups. Each check earns 0..weight points;
 * the product score is the rounded sum, clamped to 0..100.
 *
 * | Group            | Check            | Weight | Rule                                                    |
 * |------------------|------------------|--------|---------------------------------------------------------|
 * | Content (30)     | title            | 8      | present and not a placeholder ("Untitled", "Test", ...) |
 * |                  | description      | 12     | >= 50 chars pass; 1-49 warn (6 pts); empty fail         |
 * |                  | images           | 10     | 3+ pass; 1-2 warn (6 pts); 0 fail                       |
 * | SEO (20)         | seo_title        | 10     | set and <= 70 chars pass; longer warn (5); unset fail   |
 * |                  | seo_description  | 10     | 50-160 chars pass; set but outside warn (5); unset fail |
 * | Variants (25)    | variant_prices   | 15     | proportional to share of variants with price > 0        |
 * |                  | variant_options  | 10     | >1 variant needs a real option; one default variant ok  |
 * | Inventory (15)   | out_of_stock     | 10     | proportional to share of tracked variants in stock      |
 * |                  | low_stock        | 5      | proportional to share of tracked variants not low       |
 * | Publishing (10)  | status_active    | 5      | status ACTIVE                                           |
 * |                  | online_store     | 5      | published to Online Store or the store's sales channel  |
 *
 * Status: `pass` = full points, `fail` = 0 points, `warn` = partial.
 * Untracked variants are ignored by inventory checks (they never sell out).
 */

import { LOW_STOCK_THRESHOLD } from "../config";
import type {
  CheckGroup,
  CheckId,
  CheckStatus,
  HealthCheck,
  ProductHealth,
  ProductSnapshot,
  ScoreOptions,
  VariantSnapshot,
} from "./types";

export const GROUPS: ReadonlyArray<{
  id: CheckGroup;
  label: string;
  weight: number;
}> = [
  { id: "content", label: "Content", weight: 30 },
  { id: "seo", label: "SEO", weight: 20 },
  { id: "variants", label: "Variants", weight: 25 },
  { id: "inventory", label: "Inventory", weight: 15 },
  { id: "publishing", label: "Publishing", weight: 10 },
];

export const WEIGHTS: Readonly<Record<CheckId, number>> = {
  title: 8,
  description: 12,
  images: 10,
  seo_title: 10,
  seo_description: 10,
  variant_prices: 15,
  variant_options: 10,
  out_of_stock: 10,
  low_stock: 5,
  status_active: 5,
  online_store: 5,
};

export const MIN_DESCRIPTION_LENGTH = 50;
export const FULL_MARKS_IMAGE_COUNT = 3;
export const MAX_SEO_TITLE_LENGTH = 70;
export const MIN_SEO_DESCRIPTION_LENGTH = 50;
export const MAX_SEO_DESCRIPTION_LENGTH = 160;

const PLACEHOLDER_TITLES = new Set([
  "untitled",
  "untitled product",
  "new product",
  "product",
  "test",
  "test product",
  "sample product",
  "placeholder",
  "title",
]);

const DEFAULT_OPTION_VALUE = "Default Title";

/** True for titles like "Untitled" or "Test product" (case-insensitive). */
export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}

export function scoreProduct(
  product: ProductSnapshot,
  options: ScoreOptions = {},
): ProductHealth {
  const lowStockThreshold = options.lowStockThreshold ?? LOW_STOCK_THRESHOLD;

  const checks: HealthCheck[] = [
    checkTitle(product),
    checkDescription(product),
    checkImages(product),
    checkSeoTitle(product),
    checkSeoDescription(product),
    checkVariantPrices(product),
    checkVariantOptions(product),
    checkOutOfStock(product),
    checkLowStock(product, lowStockThreshold),
    checkStatus(product),
    checkOnlineStore(product),
  ];

  const total = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = Math.min(100, Math.max(0, Math.round(total)));

  return {
    score,
    checks,
    issues: checks.filter((c) => c.status !== "pass"),
  };
}

// --- Content ----------------------------------------------------------------

function checkTitle(p: ProductSnapshot): HealthCheck {
  const title = p.title.trim();
  if (!title) {
    return fail(
      "title",
      "content",
      "Title",
      "Product has no title.",
      "Products → open the product → enter a descriptive Title → Save.",
    );
  }
  if (isPlaceholderTitle(title)) {
    return fail(
      "title",
      "content",
      "Title",
      `"${title}" looks like a placeholder title.`,
      "Products → open the product → replace the Title with the real product name → Save.",
    );
  }
  return pass("title", "content", "Title", "Title is set.");
}

function checkDescription(p: ProductSnapshot): HealthCheck {
  const length = p.description.trim().length;
  const label = "Description";
  const fix = `Products → open the product → Description → write at least ${MIN_DESCRIPTION_LENGTH} characters about the product → Save.`;
  if (length >= MIN_DESCRIPTION_LENGTH) {
    return pass(
      "description",
      "content",
      label,
      `Description has ${length} characters.`,
    );
  }
  if (length === 0) {
    return fail(
      "description",
      "content",
      label,
      "Product has no description.",
      fix,
    );
  }
  return warn(
    "description",
    "content",
    label,
    WEIGHTS.description / 2,
    `Description is short (${length} of ${MIN_DESCRIPTION_LENGTH} characters).`,
    fix,
  );
}

function checkImages(p: ProductSnapshot): HealthCheck {
  const count = p.imageCount;
  const label = "Images";
  const fix = `Products → open the product → Media → Add images until there are at least ${FULL_MARKS_IMAGE_COUNT} → Save.`;
  if (count >= FULL_MARKS_IMAGE_COUNT) {
    return pass("images", "content", label, `${count} images.`);
  }
  if (count <= 0) {
    return fail("images", "content", label, "Product has no images.", fix);
  }
  return warn(
    "images",
    "content",
    label,
    6,
    `Only ${count} image${count === 1 ? "" : "s"}; ${FULL_MARKS_IMAGE_COUNT}+ recommended.`,
    fix,
  );
}

// --- SEO --------------------------------------------------------------------

function checkSeoTitle(p: ProductSnapshot): HealthCheck {
  const value = (p.seoTitle ?? "").trim();
  const label = "SEO title";
  const fix = `Products → open the product → Search engine listing → Edit → Page title (up to ${MAX_SEO_TITLE_LENGTH} characters) → Save.`;
  if (!value) {
    return fail(
      "seo_title",
      "seo",
      label,
      "No SEO page title set (search engines fall back to the product title).",
      fix,
    );
  }
  if (value.length > MAX_SEO_TITLE_LENGTH) {
    return warn(
      "seo_title",
      "seo",
      label,
      WEIGHTS.seo_title / 2,
      `SEO title is ${value.length} characters; keep it to ${MAX_SEO_TITLE_LENGTH} or fewer.`,
      fix,
    );
  }
  return pass("seo_title", "seo", label, "SEO title is set.");
}

function checkSeoDescription(p: ProductSnapshot): HealthCheck {
  const value = (p.seoDescription ?? "").trim();
  const label = "SEO description";
  const fix = `Products → open the product → Search engine listing → Edit → Meta description (${MIN_SEO_DESCRIPTION_LENGTH}-${MAX_SEO_DESCRIPTION_LENGTH} characters) → Save.`;
  if (!value) {
    return fail(
      "seo_description",
      "seo",
      label,
      "No SEO meta description set.",
      fix,
    );
  }
  if (
    value.length < MIN_SEO_DESCRIPTION_LENGTH ||
    value.length > MAX_SEO_DESCRIPTION_LENGTH
  ) {
    return warn(
      "seo_description",
      "seo",
      label,
      WEIGHTS.seo_description / 2,
      `SEO description is ${value.length} characters; aim for ${MIN_SEO_DESCRIPTION_LENGTH}-${MAX_SEO_DESCRIPTION_LENGTH}.`,
      fix,
    );
  }
  return pass("seo_description", "seo", label, "SEO description is set.");
}

// --- Variants ---------------------------------------------------------------

function checkVariantPrices(p: ProductSnapshot): HealthCheck {
  const label = "Variant prices";
  const fix =
    "Products → open the product → Variants → set a Price above 0 for each variant → Save.";
  if (p.variants.length === 0) {
    return fail("variant_prices", "variants", label, "No variants found.", fix);
  }
  const unpriced = p.variants.filter((v) => !hasPrice(v)).length;
  if (unpriced === 0) {
    return pass(
      "variant_prices",
      "variants",
      label,
      `All ${p.variants.length} variant${p.variants.length === 1 ? " has" : "s have"} a price.${truncationNote(p)}`,
    );
  }
  const okShare = (p.variants.length - unpriced) / p.variants.length;
  const message = `${unpriced} of ${p.variants.length} variant${p.variants.length === 1 ? "" : "s"} ${unpriced === 1 ? "has" : "have"} no price or a price of 0.${truncationNote(p)}`;
  if (okShare === 0) {
    return fail("variant_prices", "variants", label, message, fix);
  }
  return warn(
    "variant_prices",
    "variants",
    label,
    WEIGHTS.variant_prices * okShare,
    message,
    fix,
  );
}

function checkVariantOptions(p: ProductSnapshot): HealthCheck {
  const label = "Variant options";
  if (p.variantCount <= 1) {
    return pass(
      "variant_options",
      "variants",
      label,
      "Single variant; no options needed.",
    );
  }
  const hasRealOption = p.options.some(
    (o) =>
      o.values.length > 1 || o.values.some((v) => v !== DEFAULT_OPTION_VALUE),
  );
  if (hasRealOption) {
    return pass(
      "variant_options",
      "variants",
      label,
      "Options are configured.",
    );
  }
  return fail(
    "variant_options",
    "variants",
    label,
    `${p.variantCount} variants but no options (only "${DEFAULT_OPTION_VALUE}") to tell them apart.`,
    "Products → open the product → Variants → Add options like Size or Color → name each variant's values → Save.",
  );
}

// --- Inventory --------------------------------------------------------------

function checkOutOfStock(p: ProductSnapshot): HealthCheck {
  const label = "Out of stock";
  const tracked = trackedVariants(p);
  if (tracked.length === 0) {
    return pass(
      "out_of_stock",
      "inventory",
      label,
      "Inventory isn't tracked for this product.",
    );
  }
  const out = tracked.filter((v) => (v.inventoryQuantity ?? 0) <= 0).length;
  if (out === 0) {
    return pass(
      "out_of_stock",
      "inventory",
      label,
      `All tracked variants are in stock.${truncationNote(p)}`,
    );
  }
  const inShare = (tracked.length - out) / tracked.length;
  const message = `${out} of ${tracked.length} tracked variant${tracked.length === 1 ? " is" : "s are"} out of stock.${truncationNote(p)}`;
  const fix =
    "Products → open the product → Variants → select the variant → Inventory → enter the on-hand quantity → Save (or Products → Inventory).";
  if (inShare === 0) {
    return fail("out_of_stock", "inventory", label, message, fix);
  }
  return warn(
    "out_of_stock",
    "inventory",
    label,
    WEIGHTS.out_of_stock * inShare,
    message,
    fix,
  );
}

function checkLowStock(p: ProductSnapshot, threshold: number): HealthCheck {
  const label = "Low stock";
  const tracked = trackedVariants(p);
  const low = tracked.filter((v) => {
    const qty = v.inventoryQuantity ?? 0;
    return qty > 0 && qty <= threshold;
  }).length;
  if (low === 0) {
    return pass(
      "low_stock",
      "inventory",
      label,
      `No variants at or below ${threshold} units.`,
    );
  }
  const okShare = (tracked.length - low) / tracked.length;
  return warn(
    "low_stock",
    "inventory",
    label,
    WEIGHTS.low_stock * okShare,
    `${low} tracked variant${low === 1 ? " has" : "s have"} ${threshold} or fewer units left.${truncationNote(p)}`,
    "Products → Inventory → find the variant → increase Available or reorder stock.",
  );
}

// --- Publishing -------------------------------------------------------------

function checkStatus(p: ProductSnapshot): HealthCheck {
  const label = "Status active";
  if (p.status === "ACTIVE") {
    return pass("status_active", "publishing", label, "Product is active.");
  }
  return fail(
    "status_active",
    "publishing",
    label,
    `Product status is ${p.status.toLowerCase()}.`,
    "Products → open the product → Status (right column) → set to Active → Save.",
  );
}

/**
 * Passes when the product is on Online Store or on the store's main other
 * sales channel (`salesChannel`), so headless stores aren't penalised for
 * not using Online Store. Without channel info, Online Store only.
 */
function checkOnlineStore(p: ProductSnapshot): HealthCheck {
  const channel = p.salesChannel ?? null;
  const label = channel ? "Sales channel" : "Online Store";
  if (p.publishedToOnlineStore) {
    return pass(
      "online_store",
      "publishing",
      label,
      "Published to the Online Store.",
    );
  }
  if (channel?.published) {
    return pass(
      "online_store",
      "publishing",
      label,
      `Published to ${channel.name}.`,
    );
  }
  if (channel) {
    return fail(
      "online_store",
      "publishing",
      label,
      `Not published to ${channel.name} or the Online Store.`,
      `Products → open the product → Publishing (right column) → Manage → enable ${channel.name} → Save.`,
    );
  }
  return fail(
    "online_store",
    "publishing",
    label,
    "Not published to the Online Store.",
    "Products → open the product → Publishing (right column) → Manage → enable Online Store → Save.",
  );
}

// --- Helpers ----------------------------------------------------------------

function hasPrice(v: VariantSnapshot): boolean {
  return v.price !== null && Number.isFinite(v.price) && v.price > 0;
}

function trackedVariants(p: ProductSnapshot): VariantSnapshot[] {
  return p.variants.filter((v) => v.tracked);
}

function truncationNote(p: ProductSnapshot): string {
  return p.variantCount > p.variants.length
    ? ` (checked first ${p.variants.length} of ${p.variantCount} variants)`
    : "";
}

function build(
  id: CheckId,
  group: CheckGroup,
  label: string,
  status: CheckStatus,
  earned: number,
  message: string,
  fix: string,
): HealthCheck {
  const weight = WEIGHTS[id];
  return {
    id,
    group,
    label,
    status,
    weight,
    earned: Math.min(weight, Math.max(0, earned)),
    message,
    fix,
  };
}

function pass(
  id: CheckId,
  group: CheckGroup,
  label: string,
  message: string,
): HealthCheck {
  return build(id, group, label, "pass", WEIGHTS[id], message, "");
}

function warn(
  id: CheckId,
  group: CheckGroup,
  label: string,
  earned: number,
  message: string,
  fix: string,
): HealthCheck {
  return build(id, group, label, "warn", earned, message, fix);
}

function fail(
  id: CheckId,
  group: CheckGroup,
  label: string,
  message: string,
  fix: string,
): HealthCheck {
  return build(id, group, label, "fail", 0, message, fix);
}
