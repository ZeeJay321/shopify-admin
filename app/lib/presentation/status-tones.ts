/**
 * Tone maps with no dependency on the scoring library, so the Admin UI
 * extensions can share them without bundling scoring code.
 */

import type { RiskLevel } from "../inventory-risk/types";
import type { OrderSeverity } from "../order-ops/types";
import type { CheckStatus } from "../product-health/types";

export type Tone =
  "success" | "warning" | "critical" | "info" | "neutral" | "caution";

export function checkStatusTone(status: CheckStatus | "not_applicable"): Tone {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warning";
    case "fail":
      return "critical";
    default:
      return "neutral";
  }
}

export const RISK_TONES: Readonly<Record<RiskLevel, Tone>> = {
  critical: "critical",
  low: "warning",
  healthy: "success",
  untracked: "neutral",
};

export const SEVERITY_TONES: Readonly<Record<OrderSeverity, Tone>> = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "info",
};

/** Readiness check severity. Shown neutrally so passing checks aren't red. */
export function checkSeverityTone(
  severity: "critical" | "warning" | "info",
  status: CheckStatus | "not_applicable",
): Tone {
  if (status === "pass" || status === "not_applicable") return "neutral";
  return severity === "critical"
    ? "critical"
    : severity === "warning"
      ? "warning"
      : "info";
}

const STATUS_TONES: Readonly<Record<string, Tone>> = {
  // Product status
  ACTIVE: "success",
  DRAFT: "info",
  ARCHIVED: "neutral",
  UNLISTED: "neutral",
  // Payment (OrderDisplayFinancialStatus)
  PAID: "success",
  PARTIALLY_PAID: "warning",
  PENDING: "warning",
  AUTHORIZED: "info",
  PARTIALLY_REFUNDED: "neutral",
  REFUNDED: "neutral",
  VOIDED: "neutral",
  EXPIRED: "critical",
  // Fulfillment (OrderDisplayFulfillmentStatus)
  FULFILLED: "success",
  UNFULFILLED: "warning",
  PARTIALLY_FULFILLED: "warning",
  IN_PROGRESS: "info",
  OPEN: "warning",
  ON_HOLD: "caution",
  PENDING_FULFILLMENT: "info",
  SCHEDULED: "info",
  RESTOCKED: "neutral",
  REQUEST_DECLINED: "critical",
};

/** Tone for a Shopify status enum value (product, payment or fulfillment). */
export function statusTone(status: string | null | undefined): Tone {
  return (status && STATUS_TONES[status]) || "neutral";
}
