import type { OrderAssessment, OrdersAggregate } from "./types";

export function aggregateOrders(
  assessments: ReadonlyArray<OrderAssessment>,
): OrdersAggregate {
  const result: OrdersAggregate = {
    total: assessments.length,
    needsAttention: 0,
    excluded: 0,
    byReason: {
      UNFULFILLED_OVER_24H: 0,
      HIGH_VALUE: 0,
      CONTAINS_LOW_STOCK_ITEM: 0,
    },
    bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  };

  for (const a of assessments) {
    if (a.excluded) {
      result.excluded++;
      continue;
    }
    // Reason counts describe open orders only, so they match "needs attention".
    for (const reason of a.reasons) result.byReason[reason]++;
    if (a.needsAttention) {
      result.needsAttention++;
      result.bySeverity[a.severity]++;
    }
  }
  return result;
}
