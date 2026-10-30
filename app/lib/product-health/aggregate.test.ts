import { describe, expect, it } from "vitest";
import { aggregateStoreHealth, topIssues } from "./aggregate";
import { scoreProduct } from "./score";
import { perfectProduct, variant } from "./test-fixtures";

describe("aggregateStoreHealth", () => {
  it("averages scores and counts issues per check", () => {
    const results = [
      perfectProduct(), // 100
      perfectProduct({ description: "", seoTitle: null }), // 78
      perfectProduct({ seoTitle: null, imageCount: 0 }), // 80
      perfectProduct({
        variants: [variant({ inventoryQuantity: 0 })],
        seoTitle: null,
      }), // 80
    ].map((p) => scoreProduct(p));

    const health = aggregateStoreHealth(results);

    expect(health.sampleSize).toBe(4);
    expect(health.averageScore).toBe(Math.round((100 + 78 + 80 + 80) / 4));
    expect(health.productsWithIssues).toBe(3);
    expect(health.issueCounts[0]).toEqual({
      checkId: "seo_title",
      label: "SEO title",
      count: 3,
    });
    expect(health.issueCounts.map((c) => c.checkId)).toEqual([
      "seo_title",
      "description",
      "images",
      "out_of_stock",
    ]);
    expect(topIssues(health, 2).map((c) => c.checkId)).toEqual([
      "seo_title",
      "description",
    ]);
  });

  it("handles an empty store", () => {
    expect(aggregateStoreHealth([])).toEqual({
      sampleSize: 0,
      averageScore: null,
      productsWithIssues: 0,
      issueCounts: [],
    });
  });
});
