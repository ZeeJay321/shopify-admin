/**
 * SEO update planning and deterministic suggestions (no AI service).
 *
 * Rules: title 1-70 chars, description 1-160 chars, whitespace trimmed and
 * collapsed, no placeholder text, and at least one value must change.
 * Descriptions under 50 chars are allowed with a warning (phase 1 scores them
 * as "warn").
 */

import {
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  MIN_SEO_DESCRIPTION_LENGTH,
  isPlaceholderTitle,
} from "../product-health";
import type { ActionPlan, BeforeAfter, FieldError } from "./types";

export type SeoValues = { title: string; description: string };

export type SeoSummary = {
  title: BeforeAfter<string>;
  description: BeforeAfter<string>;
};

const SEO_PLACEHOLDERS = new Set([
  "lorem ipsum",
  "todo",
  "tbd",
  "seo title",
  "seo description",
  "meta description",
  "description",
]);

/** Trim and collapse internal whitespace (incl. newlines). */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isPlaceholderSeo(value: string): boolean {
  const lower = normalizeText(value).toLowerCase();
  return (
    isPlaceholderTitle(lower) ||
    SEO_PLACEHOLDERS.has(lower) ||
    lower.startsWith("lorem ipsum")
  );
}

export function planSeoUpdate({
  current,
  next,
}: {
  current: { title: string | null; description: string | null };
  next: SeoValues;
}): ActionPlan<SeoSummary> & { values: SeoValues } {
  const values = {
    title: normalizeText(next.title),
    description: normalizeText(next.description),
  };
  const before = {
    title: normalizeText(current.title ?? ""),
    description: normalizeText(current.description ?? ""),
  };
  const errors: FieldError[] = [];
  const warnings: string[] = [];

  checkField(errors, "title", "SEO title", values.title, MAX_SEO_TITLE_LENGTH);
  checkField(
    errors,
    "description",
    "SEO description",
    values.description,
    MAX_SEO_DESCRIPTION_LENGTH,
  );

  if (
    errors.length === 0 &&
    values.title === before.title &&
    values.description === before.description
  ) {
    errors.push({
      field: "form",
      message: "Nothing changed. Edit the title or description first.",
    });
  }
  if (
    values.description &&
    values.description.length < MIN_SEO_DESCRIPTION_LENGTH
  ) {
    warnings.push(
      `Descriptions of ${MIN_SEO_DESCRIPTION_LENGTH}-${MAX_SEO_DESCRIPTION_LENGTH} characters work best in search results.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    values,
    summary: {
      title: { before: before.title, after: values.title },
      description: { before: before.description, after: values.description },
    },
    requiresExtraConfirmation: false,
  };
}

function checkField(
  errors: FieldError[],
  field: string,
  label: string,
  value: string,
  max: number,
): void {
  if (!value) {
    errors.push({ field, message: `${label} can't be empty.` });
  } else if (value.length > max) {
    errors.push({
      field,
      message: `${label} is ${value.length} characters; the limit is ${max}.`,
    });
  } else if (isPlaceholderSeo(value)) {
    errors.push({ field, message: `"${value}" looks like placeholder text.` });
  }
}

/** Cut at the last word boundary that fits `max` (adding "…" when cut). */
export function truncateAtWord(text: string, max: number): string {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * Deterministic prefill. The merchant edits it before confirming.
 * - title: "{title} | {vendor}" when it fits, else the title cut to fit
 * - description: the first sentence(s) of the product description, cut to
 *   fit at a word boundary; a short generic line if there's no description
 */
export function suggestSeo({
  title,
  vendor,
  description,
}: {
  title: string;
  vendor: string;
  description: string;
}): SeoValues {
  const cleanTitle = normalizeText(title);
  const cleanVendor = normalizeText(vendor);
  const withVendor =
    cleanVendor && cleanVendor.toLowerCase() !== cleanTitle.toLowerCase()
      ? `${cleanTitle} | ${cleanVendor}`
      : cleanTitle;
  const suggestedTitle =
    withVendor.length <= MAX_SEO_TITLE_LENGTH
      ? withVendor
      : truncateAtWord(cleanTitle, MAX_SEO_TITLE_LENGTH);

  const body = normalizeText(description);
  let suggestedDescription: string;
  if (body) {
    const sentences = body.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [body];
    let picked = "";
    for (const sentence of sentences) {
      const candidate = normalizeText(`${picked} ${sentence}`);
      if (picked && candidate.length > MAX_SEO_DESCRIPTION_LENGTH) break;
      picked = candidate;
      if (picked.length >= MIN_SEO_DESCRIPTION_LENGTH) break;
    }
    suggestedDescription = truncateAtWord(picked, MAX_SEO_DESCRIPTION_LENGTH);
  } else {
    suggestedDescription = truncateAtWord(
      `Shop ${cleanTitle}${cleanVendor ? ` by ${cleanVendor}` : ""}.`,
      MAX_SEO_DESCRIPTION_LENGTH,
    );
  }

  return { title: suggestedTitle, description: suggestedDescription };
}
