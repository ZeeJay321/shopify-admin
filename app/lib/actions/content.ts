/**
 * Title and description editing (pure): validation shared by the dialog
 * preview and the server, plus a safe plain-text -> HTML conversion.
 */

import {
  MAX_DESCRIPTION_TEXT_LENGTH,
  MAX_PRODUCT_TITLE_LENGTH,
} from "../config";
import { MIN_DESCRIPTION_LENGTH, isPlaceholderTitle } from "../product-health";
import { normalizeText } from "./seo";
import type { ActionPlan, BeforeAfter, FieldError } from "./types";

export type ContentValues = { title: string; description: string };
export type ContentSummary = {
  title: BeforeAfter<string>;
  description: BeforeAfter<string>;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Plain text to HTML: everything is escaped (no markup is ever passed
 * through), blank lines start a new paragraph, single newlines become <br>.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p>${block
          .replace(/[&<>"']/g, (c) => ESCAPES[c])
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** Description text keeps line breaks; only trailing space is trimmed. */
export function normalizeDescription(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function planContentUpdate({
  current,
  next,
}: {
  current: ContentValues;
  next: ContentValues;
}): ActionPlan<ContentSummary> & {
  values: ContentValues;
  /** Only changed fields are sent, so an untouched rich description keeps its formatting. */
  changed: { title: boolean; description: boolean };
} {
  const values = {
    title: normalizeText(next.title),
    description: normalizeDescription(next.description),
  };
  const errors: FieldError[] = [];
  const warnings: string[] = [];

  if (values.title === "") {
    errors.push({ field: "title", message: "Enter a product title." });
  } else if (values.title.length > MAX_PRODUCT_TITLE_LENGTH) {
    errors.push({
      field: "title",
      message: `Keep the title to ${MAX_PRODUCT_TITLE_LENGTH} characters or fewer.`,
    });
  } else if (isPlaceholderTitle(values.title)) {
    errors.push({
      field: "title",
      message:
        "This still looks like a placeholder. Use the real product name.",
    });
  }

  if (values.description.length > MAX_DESCRIPTION_TEXT_LENGTH) {
    errors.push({
      field: "description",
      message: `Keep the description to ${MAX_DESCRIPTION_TEXT_LENGTH} characters or fewer.`,
    });
  } else if (values.description.length < MIN_DESCRIPTION_LENGTH) {
    warnings.push(
      `Descriptions under ${MIN_DESCRIPTION_LENGTH} characters still count as missing in health checks.`,
    );
  }

  const changed = {
    title: values.title !== normalizeText(current.title),
    description:
      values.description !== normalizeDescription(current.description),
  };
  if (!changed.title && !changed.description && errors.length === 0) {
    errors.push({ field: "form", message: "Nothing has changed yet." });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    values,
    changed,
    summary: {
      title: { before: current.title, after: values.title },
      description: { before: current.description, after: values.description },
    },
    requiresExtraConfirmation: false,
  };
}
