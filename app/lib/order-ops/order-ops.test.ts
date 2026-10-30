import { describe, expect, it } from "vitest";
import { HIGH_VALUE_ORDER_THRESHOLD, UNFULFILLED_ALERT_HOURS } from "../config";
import { aggregateOrders } from "./aggregate";
import { classifyOrder, severityFor } from "./classify";
import { daysAgoIso, startOfDayIso } from "./dates";
import type { LowStockLookup, OrderSnapshot } from "./types";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * HOUR).toISOString();
}

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "1001",
    name: "#1001",
    createdAt: hoursAgo(1),
    cancelledAt: null,
    totalAmount: 40,
    currencyCode: "USD",
    financialStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    tags: [],
    lineItems: [{ title: "Tee", quantity: 1, variantId: "11", productId: "1" }],
    ...overrides,
  };
}

const lookup: LowStockLookup = (id) =>
  ({ "11": "low", "12": "critical" })[id] as "low" | "critical" | undefined;

describe("classifyOrder", () => {
  it("uses the documented defaults", () => {
    expect(UNFULFILLED_ALERT_HOURS).toBe(24);
    expect(HIGH_VALUE_ORDER_THRESHOLD).toBe(500);
  });

  it("does not flag a fresh, fulfilled, normal order", () => {
    expect(classifyOrder(order(), { now: NOW })).toEqual({
      needsAttention: false,
      severity: "LOW",
      reasons: [],
      excluded: null,
    });
  });

  describe("UNFULFILLED_OVER_24H", () => {
    it("is not raised under the threshold", () => {
      const a = classifyOrder(
        order({ fulfillmentStatus: "UNFULFILLED", createdAt: hoursAgo(23.9) }),
        { now: NOW },
      );
      expect(a.reasons).toEqual([]);
    });

    it("is not raised exactly at the threshold, and is just over it", () => {
      expect(
        classifyOrder(
          order({ fulfillmentStatus: "UNFULFILLED", createdAt: hoursAgo(24) }),
          { now: NOW },
        ).reasons,
      ).toEqual([]);
      const over = classifyOrder(
        order({ fulfillmentStatus: "UNFULFILLED", createdAt: hoursAgo(24.01) }),
        { now: NOW },
      );
      expect(over.reasons).toEqual(["UNFULFILLED_OVER_24H"]);
      expect(over).toMatchObject({ needsAttention: true, severity: "MEDIUM" });
    });

    it("treats partially fulfilled and on-hold as unfulfilled", () => {
      for (const status of ["PARTIALLY_FULFILLED", "ON_HOLD", "IN_PROGRESS"]) {
        expect(
          classifyOrder(
            order({ fulfillmentStatus: status, createdAt: hoursAgo(48) }),
            { now: NOW },
          ).reasons,
        ).toContain("UNFULFILLED_OVER_24H");
      }
    });

    it("respects configurable hours", () => {
      const a = classifyOrder(
        order({ fulfillmentStatus: "UNFULFILLED", createdAt: hoursAgo(5) }),
        { now: NOW, thresholds: { unfulfilledHours: 4, highValue: 500 } },
      );
      expect(a.reasons).toEqual(["UNFULFILLED_OVER_24H"]);
    });
  });

  describe("HIGH_VALUE", () => {
    it("flags totals at or above the threshold", () => {
      expect(
        classifyOrder(order({ totalAmount: 499.99 }), { now: NOW }).reasons,
      ).toEqual([]);
      const at = classifyOrder(order({ totalAmount: 500 }), { now: NOW });
      expect(at.reasons).toEqual(["HIGH_VALUE"]);
      expect(at.severity).toBe("LOW");
    });
  });

  describe("CONTAINS_LOW_STOCK_ITEM", () => {
    it("flags orders with a critical or low variant", () => {
      const a = classifyOrder(
        order({
          lineItems: [
            { title: "Hat", quantity: 1, variantId: "99", productId: "9" },
            { title: "Tee", quantity: 2, variantId: "12", productId: "1" },
          ],
        }),
        { now: NOW, lowStock: lookup },
      );
      expect(a.reasons).toEqual(["CONTAINS_LOW_STOCK_ITEM"]);
    });

    it("ignores custom line items without a variant", () => {
      const a = classifyOrder(
        order({
          lineItems: [
            {
              title: "Gift wrap",
              quantity: 1,
              variantId: null,
              productId: null,
            },
          ],
        }),
        { now: NOW, lowStock: lookup },
      );
      expect(a.reasons).toEqual([]);
    });

    it("is skipped when no lookup is available (degraded mode)", () => {
      expect(classifyOrder(order(), { now: NOW }).reasons).toEqual([]);
    });
  });

  it("combines multiple reasons into HIGH severity", () => {
    const a = classifyOrder(
      order({
        fulfillmentStatus: "UNFULFILLED",
        createdAt: hoursAgo(30),
        totalAmount: 900,
      }),
      { now: NOW, lowStock: lookup },
    );
    expect(a.reasons).toEqual([
      "UNFULFILLED_OVER_24H",
      "HIGH_VALUE",
      "CONTAINS_LOW_STOCK_ITEM",
    ]);
    expect(a).toMatchObject({ needsAttention: true, severity: "HIGH" });
  });

  it("excludes cancelled orders from needs attention", () => {
    const a = classifyOrder(
      order({
        cancelledAt: hoursAgo(2),
        fulfillmentStatus: "UNFULFILLED",
        createdAt: hoursAgo(48),
        totalAmount: 900,
      }),
      { now: NOW },
    );
    expect(a).toMatchObject({ needsAttention: false, excluded: "CANCELLED" });
  });

  it("excludes fully refunded orders but not partially refunded ones", () => {
    const big = { totalAmount: 900 };
    expect(
      classifyOrder(order({ ...big, financialStatus: "REFUNDED" }), {
        now: NOW,
      }),
    ).toMatchObject({ needsAttention: false, excluded: "REFUNDED" });
    expect(
      classifyOrder(order({ ...big, financialStatus: "PARTIALLY_REFUNDED" }), {
        now: NOW,
      }),
    ).toMatchObject({ needsAttention: true, excluded: null });
  });
});

describe("severityFor", () => {
  it("weights unfulfilled as 2 points and the others as 1", () => {
    expect(severityFor([])).toBe("LOW");
    expect(severityFor(["HIGH_VALUE"])).toBe("LOW");
    expect(severityFor(["HIGH_VALUE", "CONTAINS_LOW_STOCK_ITEM"])).toBe(
      "MEDIUM",
    );
    expect(severityFor(["UNFULFILLED_OVER_24H"])).toBe("MEDIUM");
    expect(severityFor(["UNFULFILLED_OVER_24H", "HIGH_VALUE"])).toBe("HIGH");
  });
});

describe("aggregateOrders", () => {
  it("counts reasons, severities and attention across orders", () => {
    const assessments = [
      order(),
      order({ totalAmount: 600 }),
      order({
        fulfillmentStatus: "UNFULFILLED",
        createdAt: hoursAgo(30),
        totalAmount: 700,
      }),
      order({ fulfillmentStatus: "UNFULFILLED", createdAt: hoursAgo(30) }),
      order({ cancelledAt: hoursAgo(1), totalAmount: 900 }),
    ].map((o) => classifyOrder(o, { now: NOW }));

    expect(aggregateOrders(assessments)).toEqual({
      total: 5,
      needsAttention: 3,
      excluded: 1,
      byReason: {
        UNFULFILLED_OVER_24H: 2,
        HIGH_VALUE: 2,
        CONTAINS_LOW_STOCK_ITEM: 0,
      },
      bySeverity: { HIGH: 1, MEDIUM: 1, LOW: 1 },
    });
  });

  it("handles no orders", () => {
    expect(aggregateOrders([]).needsAttention).toBe(0);
  });
});

describe("dates", () => {
  it("computes the start of today in the shop timezone", () => {
    expect(startOfDayIso(NOW, "UTC")).toBe("2026-10-30T00:00:00+00:00");
    expect(startOfDayIso(NOW, "Asia/Karachi")).toBe(
      "2026-10-30T00:00:00+05:00",
    );
    // 12:00 UTC is still the 30th in New York (UTC-4 in late October).
    expect(startOfDayIso(NOW, "America/New_York")).toBe(
      "2026-10-30T00:00:00-04:00",
    );
    // Late evening UTC is already tomorrow in Tokyo.
    expect(startOfDayIso(new Date("2026-10-30T20:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-10-31T00:00:00+09:00",
    );
  });

  it("falls back to UTC for unknown zones", () => {
    expect(startOfDayIso(NOW, "Not/AZone")).toBe("2026-10-30T00:00:00+00:00");
  });

  it("computes day offsets", () => {
    expect(daysAgoIso(NOW, 7)).toBe("2026-10-23T12:00:00.000Z");
  });
});
