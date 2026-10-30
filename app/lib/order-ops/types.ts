/**
 * Plain order types for Order Operations. Deliberately carries NO customer
 * data (no names, emails, addresses or phones): only what's needed to triage.
 */

export type OrderLineItem = {
  title: string;
  quantity: number;
  /** Numeric ids; null for custom items or deleted products. */
  variantId: string | null;
  productId: string | null;
};

export type OrderSnapshot = {
  /** Numeric order id (for the Shopify Admin link). */
  id: string;
  /** Display name, e.g. "#1001". */
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  totalAmount: number;
  currencyCode: string;
  /** Shopify OrderDisplayFinancialStatus, e.g. PAID, REFUNDED. */
  financialStatus: string | null;
  /** Shopify OrderDisplayFulfillmentStatus, e.g. UNFULFILLED, FULFILLED. */
  fulfillmentStatus: string;
  tags: string[];
  lineItems: OrderLineItem[];
};

export type OrderReason =
  "UNFULFILLED_OVER_24H" | "HIGH_VALUE" | "CONTAINS_LOW_STOCK_ITEM";

export type OrderSeverity = "HIGH" | "MEDIUM" | "LOW";

/** Why an order is excluded from "needs attention". */
export type OrderExclusion = "CANCELLED" | "REFUNDED";

export type OrderAssessment = {
  needsAttention: boolean;
  severity: OrderSeverity;
  reasons: OrderReason[];
  excluded: OrderExclusion | null;
};

export type OrderThresholds = {
  unfulfilledHours: number;
  highValue: number;
};

/** Variant risk from the phase 3 inventory library ("critical" | "low"). */
export type LowStockLookup = (
  variantId: string,
) => "critical" | "low" | undefined;

export type OrdersAggregate = {
  total: number;
  needsAttention: number;
  excluded: number;
  byReason: Record<OrderReason, number>;
  bySeverity: Record<OrderSeverity, number>;
};
