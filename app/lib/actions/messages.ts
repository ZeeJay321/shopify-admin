/**
 * Merchant-facing wording for confirmations and outcomes. Fixed copy only:
 * raw Shopify messages never reach the UI.
 */

import type { InventorySummary } from "./inventory";

export type WriteErrorCode =
  | "validation"
  | "confirmation_required"
  | "acknowledgement_required"
  | "permission_needed"
  | "conflict"
  | "not_found"
  | "throttled"
  | "failed";

export function describeSeoChange(productTitle: string): string {
  return `This will update the SEO title and description for "${productTitle}".`;
}

export function describeStatusChange(
  productTitle: string,
  next: string,
): string {
  return next === "ACTIVE"
    ? `This will set "${productTitle}" to Active. It becomes visible on every sales channel it's published to.`
    : `This will move "${productTitle}" to Draft. It will be hidden from all sales channels.`;
}

export function describeInventoryChange(
  label: string,
  locationName: string,
  summary: InventorySummary,
): string {
  const sign = summary.delta > 0 ? "+" : "";
  return `This will change available stock for "${label}" at ${locationName} from ${summary.before} to ${summary.after} (${sign}${summary.delta}).`;
}

export function describeSeoBatch(count: number): string {
  return `This will update SEO for ${count} product${count === 1 ? "" : "s"}.`;
}

const ERROR_COPY: Record<WriteErrorCode, string> = {
  validation: "Some values need fixing. Check the highlighted fields.",
  confirmation_required: "Please review the change and confirm it.",
  acknowledgement_required:
    "Please acknowledge the warnings before confirming.",
  permission_needed:
    "The app needs permission to make changes. Open the app from Shopify Admin and approve the new permissions.",
  conflict:
    "This changed in Shopify since you opened it. Review the current values and try again.",
  not_found:
    "This item no longer exists in Shopify, or isn't stocked at that location.",
  throttled: "Shopify is busy. Wait a few seconds and try again.",
  failed:
    "Shopify couldn't save the change. Try again, or make it in Shopify Admin.",
};

export function writeErrorMessage(code: WriteErrorCode): string {
  return ERROR_COPY[code];
}
