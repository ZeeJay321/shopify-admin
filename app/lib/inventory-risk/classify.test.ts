import { describe, expect, it } from "vitest";
import { CRITICAL_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD } from "../config";
import { compareRisk, summarizeInventory } from "./aggregate";
import { classifyVariant, riskFor } from "./classify";
import type { LocationLevel, VariantInventory } from "./types";

function variant(
  levels: Array<[string, number]>,
  overrides: Partial<VariantInventory> = {},
): VariantInventory {
  return {
    variantId: "1",
    variantTitle: "Default Title",
    productId: "10",
    productTitle: "Tee",
    tracked: true,
    levels: levels.map(([name, available], i): LocationLevel => ({
      locationId: String(i + 1),
      locationName: name,
      available,
    })),
    ...overrides,
  };
}

describe("riskFor (threshold boundaries)", () => {
  it("uses the shared thresholds", () => {
    expect(CRITICAL_STOCK_THRESHOLD).toBe(2);
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });

  it.each([
    [-3, "critical"],
    [0, "critical"],
    [1, "critical"],
    [2, "critical"], // == critical threshold
    [3, "low"],
    [5, "low"], // == low threshold
    [6, "healthy"],
    [500, "healthy"],
  ] as const)("available %i -> %s", (available, risk) => {
    expect(riskFor(available)).toBe(risk);
  });

  it("accepts custom thresholds", () => {
    expect(riskFor(4, { critical: 0, low: 3 })).toBe("healthy");
    expect(riskFor(0, { critical: 0, low: 3 })).toBe("critical");
  });
});

describe("classifyVariant", () => {
  it("classifies a healthy variant", () => {
    const r = classifyVariant(variant([["Main", 40]]));
    expect(r).toMatchObject({
      risk: "healthy",
      available: 40,
      outOfStock: false,
    });
  });

  it("classifies low stock", () => {
    expect(classifyVariant(variant([["Main", 4]])).risk).toBe("low");
  });

  it("classifies out of stock as critical", () => {
    const r = classifyVariant(variant([["Main", 0]]));
    expect(r).toMatchObject({
      risk: "critical",
      available: 0,
      outOfStock: true,
    });
  });

  it("treats a variant with no inventory levels as out of stock", () => {
    expect(classifyVariant(variant([]))).toMatchObject({
      risk: "critical",
      available: 0,
    });
  });

  it("excludes untracked variants from risk", () => {
    const r = classifyVariant(variant([["Main", 0]], { tracked: false }));
    expect(r).toMatchObject({ risk: "untracked", outOfStock: false });
  });

  describe("multiple locations", () => {
    const multi = variant([
      ["Warehouse", 4],
      ["Store", 0],
      ["Pop-up", 3],
    ]);

    it("sums available across locations and keeps the breakdown", () => {
      const r = classifyVariant(multi);
      expect(r.available).toBe(7);
      expect(r.risk).toBe("healthy");
      expect(r.byLocation.map((l) => [l.locationName, l.available])).toEqual([
        ["Warehouse", 4],
        ["Store", 0],
        ["Pop-up", 3],
      ]);
    });

    it("uses one location's quantity when filtered", () => {
      expect(classifyVariant(multi, { locationId: "2" })).toMatchObject({
        available: 0,
        risk: "critical",
      });
      expect(classifyVariant(multi, { locationId: "1" }).risk).toBe("low");
    });

    it("treats a location the item isn't stocked at as 0", () => {
      expect(classifyVariant(multi, { locationId: "99" }).available).toBe(0);
    });

    it("lets oversold locations reduce the total", () => {
      expect(
        classifyVariant(
          variant([
            ["A", 8],
            ["B", -4],
          ]),
        ).available,
      ).toBe(4);
    });
  });
});

describe("summarizeInventory", () => {
  it("counts each risk level and ranks the top at-risk items", () => {
    const risks = [
      variant([["Main", 50]], { variantId: "h" }),
      variant([["Main", 4]], { variantId: "low4" }),
      variant([["Main", 3]], { variantId: "low3" }),
      variant([["Main", 0]], { variantId: "out" }),
      variant([["Main", 2]], { variantId: "crit2" }),
      variant([["Main", 0]], { variantId: "untracked", tracked: false }),
    ].map((v) => classifyVariant(v));

    const summary = summarizeInventory(risks, 3);

    expect(summary.total).toBe(6);
    expect(summary.counts).toEqual({
      critical: 2,
      low: 2,
      healthy: 1,
      untracked: 1,
    });
    expect(summary.topAtRisk.map((r) => r.variant.variantId)).toEqual([
      "out",
      "crit2",
      "low3",
    ]);
  });

  it("handles an empty list", () => {
    expect(summarizeInventory([])).toEqual({
      total: 0,
      counts: { critical: 0, low: 0, healthy: 0, untracked: 0 },
      topAtRisk: [],
    });
  });

  it("orders ties by product then variant title", () => {
    const a = classifyVariant(variant([["M", 1]], { productTitle: "B" }));
    const b = classifyVariant(variant([["M", 1]], { productTitle: "A" }));
    expect([a, b].sort(compareRisk)[0]).toBe(b);
  });
});
