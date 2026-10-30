/** Human labels for enums and codes. Never show raw enum values. */

import { UNFULFILLED_ALERT_HOURS } from "../config";
import type { RiskLevel } from "../inventory-risk/types";
import type { OrderReason, OrderSeverity } from "../order-ops/types";

/** "PARTIALLY_FULFILLED" -> "Partially fulfilled"; empty -> "—". */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  critical: "Critical",
  low: "Low stock",
  healthy: "Healthy",
  untracked: "Not tracked",
};

export const REASON_LABELS: Readonly<Record<OrderReason, string>> = {
  UNFULFILLED_OVER_24H: `Unfulfilled > ${UNFULFILLED_ALERT_HOURS}h`,
  HIGH_VALUE: "High value",
  CONTAINS_LOW_STOCK_ITEM: "Low-stock item",
};

export const REASON_EXPLANATIONS: Readonly<Record<OrderReason, string>> = {
  UNFULFILLED_OVER_24H: `Still unfulfilled more than ${UNFULFILLED_ALERT_HOURS} hours after it was placed.`,
  HIGH_VALUE: "The order total is at or above the high-value threshold.",
  CONTAINS_LOW_STOCK_ITEM:
    "Contains a variant that is critical or low in Inventory Risk.",
};

export const SEVERITY_LABELS: Readonly<Record<OrderSeverity, string>> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const CHECK_STATUS_LABELS = {
  pass: "Passed",
  warn: "Needs attention",
  fail: "Failing",
  not_applicable: "Not applicable",
} as const;

/** "1 product" / "3 products". */
export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${formatInt(count)} ${count === 1 ? singular : pluralForm}`;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
