/**
 * Order triage model (deterministic, no I/O).
 *
 * | Reason                  | Rule                                                        | Points |
 * |-------------------------|-------------------------------------------------------------|--------|
 * | UNFULFILLED_OVER_24H    | still unfulfilled and created > UNFULFILLED_ALERT_HOURS ago | 2      |
 * | HIGH_VALUE              | current total >= HIGH_VALUE_ORDER_THRESHOLD (shop currency) | 1      |
 * | CONTAINS_LOW_STOCK_ITEM | a line item's variant is CRITICAL or LOW (inventory risk)   | 1      |
 *
 * Severity: HIGH >= 3 points, MEDIUM = 2, LOW otherwise.
 * needsAttention = at least one reason, and the order is not excluded.
 * Excluded: cancelled orders and fully refunded orders (no action left).
 */

import { HIGH_VALUE_ORDER_THRESHOLD, UNFULFILLED_ALERT_HOURS } from "../config";
import type {
  LowStockLookup,
  OrderAssessment,
  OrderExclusion,
  OrderReason,
  OrderSeverity,
  OrderSnapshot,
  OrderThresholds,
} from "./types";

export const DEFAULT_ORDER_THRESHOLDS: OrderThresholds = {
  unfulfilledHours: UNFULFILLED_ALERT_HOURS,
  highValue: HIGH_VALUE_ORDER_THRESHOLD,
};

/** Fulfillment statuses where the merchant still has work to do. */
export const OPEN_FULFILLMENT_STATUSES: ReadonlySet<string> = new Set([
  "UNFULFILLED",
  "PARTIALLY_FULFILLED",
  "IN_PROGRESS",
  "ON_HOLD",
  "OPEN",
  "PENDING_FULFILLMENT",
]);

export const REASON_POINTS: Record<OrderReason, number> = {
  UNFULFILLED_OVER_24H: 2,
  HIGH_VALUE: 1,
  CONTAINS_LOW_STOCK_ITEM: 1,
};

const HOUR_MS = 60 * 60 * 1000;

export function classifyOrder(
  order: OrderSnapshot,
  {
    now,
    lowStock = () => undefined,
    thresholds = DEFAULT_ORDER_THRESHOLDS,
  }: {
    now: Date;
    lowStock?: LowStockLookup;
    thresholds?: OrderThresholds;
  },
): OrderAssessment {
  const reasons: OrderReason[] = [];

  if (isUnfulfilled(order)) {
    const ageMs = now.getTime() - Date.parse(order.createdAt);
    if (ageMs > thresholds.unfulfilledHours * HOUR_MS) {
      reasons.push("UNFULFILLED_OVER_24H");
    }
  }
  if (order.totalAmount >= thresholds.highValue) {
    reasons.push("HIGH_VALUE");
  }
  if (
    order.lineItems.some(
      (item) =>
        item.variantId !== null && lowStock(item.variantId) !== undefined,
    )
  ) {
    reasons.push("CONTAINS_LOW_STOCK_ITEM");
  }

  const excluded = exclusionFor(order);
  return {
    needsAttention: excluded === null && reasons.length > 0,
    severity: severityFor(reasons),
    reasons,
    excluded,
  };
}

export function isUnfulfilled(order: OrderSnapshot): boolean {
  return OPEN_FULFILLMENT_STATUSES.has(order.fulfillmentStatus);
}

export function severityFor(reasons: readonly OrderReason[]): OrderSeverity {
  const points = reasons.reduce((sum, r) => sum + REASON_POINTS[r], 0);
  if (points >= 3) return "HIGH";
  if (points === 2) return "MEDIUM";
  return "LOW";
}

function exclusionFor(order: OrderSnapshot): OrderExclusion | null {
  if (order.cancelledAt) return "CANCELLED";
  if (order.financialStatus === "REFUNDED") return "REFUNDED";
  return null;
}
