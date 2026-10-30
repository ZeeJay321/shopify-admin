/**
 * Stock adjustment planning: integers only, resulting quantity >= 0, no
 * no-ops, |delta| <= MAX_INVENTORY_ADJUSTMENT (default 1000). Large changes
 * (> LARGE_ADJUSTMENT_WARN) and setting stock to 0 need an acknowledgement.
 */

import { LARGE_ADJUSTMENT_WARN, MAX_INVENTORY_ADJUSTMENT } from "../config";
import type { ActionPlan, FieldError } from "./types";

export type InventorySummary = { before: number; after: number; delta: number };

/** Parse a form value as an integer; null if it isn't one. */
export function parseIntegerInput(
  value: string | null | undefined,
): number | null {
  const trimmed = (value ?? "").trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

export function planInventoryAdjustment({
  expected,
  next,
  max = MAX_INVENTORY_ADJUSTMENT,
  warnAbove = LARGE_ADJUSTMENT_WARN,
}: {
  /** The quantity the merchant saw (sent to Shopify as changeFromQuantity). */
  expected: number;
  next: number | null;
  max?: number;
  warnAbove?: number;
}): ActionPlan<InventorySummary> {
  const errors: FieldError[] = [];
  const warnings: string[] = [];
  const after = next ?? expected;
  const delta = after - expected;

  if (!Number.isSafeInteger(expected)) {
    errors.push({
      field: "form",
      message: "The current quantity is invalid. Reload the page.",
    });
  }
  if (next === null || !Number.isSafeInteger(next)) {
    errors.push({ field: "quantity", message: "Enter a whole number." });
  } else if (next < 0) {
    errors.push({ field: "quantity", message: "Quantity can't be below 0." });
  } else if (delta === 0) {
    errors.push({
      field: "quantity",
      message: "That's the current quantity. Enter a different number.",
    });
  } else if (Math.abs(delta) > max) {
    errors.push({
      field: "quantity",
      message: `Changes are limited to ${max} units at a time. Use Shopify Admin for larger corrections.`,
    });
  }

  const valid = errors.length === 0;
  if (valid && Math.abs(delta) > warnAbove) {
    warnings.push(
      `This changes stock by ${delta > 0 ? "+" : ""}${delta} units.`,
    );
  }
  if (valid && after === 0) {
    warnings.push(
      "This sets available stock to 0. The variant will show as sold out.",
    );
  }

  return {
    valid,
    errors,
    warnings,
    summary: { before: expected, after, delta },
    requiresExtraConfirmation: valid && warnings.length > 0,
  };
}
