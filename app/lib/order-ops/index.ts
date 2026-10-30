import { UNFULFILLED_ALERT_HOURS } from "../config";

export * from "./types";
export {
  classifyOrder,
  isUnfulfilled,
  severityFor,
  DEFAULT_ORDER_THRESHOLDS,
  OPEN_FULFILLMENT_STATUSES,
  REASON_POINTS,
} from "./classify";
export { aggregateOrders } from "./aggregate";

export const REASON_LABELS = {
  UNFULFILLED_OVER_24H: `Unfulfilled > ${UNFULFILLED_ALERT_HOURS}h`,
  HIGH_VALUE: "High value",
  CONTAINS_LOW_STOCK_ITEM: "Low-stock item",
} as const;

export const SEVERITY_TONES = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "info",
} as const;
