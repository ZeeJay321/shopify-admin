import { describe, expect, it } from "vitest";
import { GROUPS, WEIGHTS, scoreProduct } from "./score";
import { perfectProduct, variant } from "./test-fixtures";
import type { CheckId, ProductHealth } from "./types";

function check(result: ProductHealth, id: CheckId) {
  const found = result.checks.find((c) => c.id === id);
  if (!found) throw new Error(`missing check ${id}`);
  return found;
}

describe("scoring model", () => {
  it("weights total 100 and match group totals", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(GROUPS.reduce((a, g) => a + g.weight, 0)).toBe(100);

    const result = scoreProduct(perfectProduct());
    for (const group of GROUPS) {
      const groupWeight = result.checks
        .filter((c) => c.group === group.id)
        .reduce((a, c) => a + c.weight, 0);
      expect(groupWeight).toBe(group.weight);
    }
  });
});

describe("scoreProduct", () => {
  it("gives a perfect product 100 with no issues", () => {
    const result = scoreProduct(perfectProduct());
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(
      result.checks.every((c) => c.status === "pass" && c.fix === ""),
    ).toBe(true);
  });

  it("fails a missing description and warns on a short one", () => {
    const missing = scoreProduct(perfectProduct({ description: "  " }));
    expect(check(missing, "description").status).toBe("fail");
    expect(missing.score).toBe(100 - WEIGHTS.description);
    expect(check(missing, "description").fix).toMatch(/Description/);

    const short = scoreProduct(perfectProduct({ description: "Soft hoodie." }));
    expect(check(short, "description").status).toBe("warn");
    expect(short.score).toBe(100 - WEIGHTS.description / 2);
  });

  it("fails no images and gives partial credit for 1-2 images", () => {
    const none = scoreProduct(perfectProduct({ imageCount: 0 }));
    expect(check(none, "images").status).toBe("fail");
    expect(none.score).toBe(90);

    const one = scoreProduct(perfectProduct({ imageCount: 1 }));
    expect(check(one, "images").status).toBe("warn");
    expect(check(one, "images").earned).toBe(6);

    const three = scoreProduct(perfectProduct({ imageCount: 3 }));
    expect(check(three, "images").status).toBe("pass");
  });

  it("fails missing SEO title and SEO description", () => {
    const result = scoreProduct(
      perfectProduct({ seoTitle: null, seoDescription: "" }),
    );
    expect(check(result, "seo_title").status).toBe("fail");
    expect(check(result, "seo_description").status).toBe("fail");
    expect(result.score).toBe(80);
  });

  it("warns when SEO fields are outside sensible lengths", () => {
    const result = scoreProduct(
      perfectProduct({
        seoTitle: "x".repeat(71),
        seoDescription: "Too short.",
      }),
    );
    expect(check(result, "seo_title").status).toBe("warn");
    expect(check(result, "seo_description").status).toBe("warn");
    expect(result.score).toBe(90);
  });

  it("fails a single variant priced at 0 or missing", () => {
    for (const price of [0, null]) {
      const result = scoreProduct(
        perfectProduct({ variants: [variant({ price })] }),
      );
      expect(check(result, "variant_prices").status).toBe("fail");
      expect(result.score).toBe(100 - WEIGHTS.variant_prices);
    }
  });

  it("gives proportional credit when some variants are unpriced", () => {
    const result = scoreProduct(
      perfectProduct({
        options: [{ name: "Size", values: ["S", "M", "L"] }],
        variantCount: 3,
        variants: [
          variant({ title: "S" }),
          variant({ title: "M", price: 0 }),
          variant({ title: "L" }),
        ],
      }),
    );
    const prices = check(result, "variant_prices");
    expect(prices.status).toBe("warn");
    expect(prices.earned).toBeCloseTo(10);
    expect(result.score).toBe(95);
  });

  it("flags an out-of-stock variant", () => {
    const result = scoreProduct(
      perfectProduct({ variants: [variant({ inventoryQuantity: 0 })] }),
    );
    expect(check(result, "out_of_stock").status).toBe("fail");
    // Out-of-stock is not also "low stock".
    expect(check(result, "low_stock").status).toBe("pass");
    expect(result.score).toBe(100 - WEIGHTS.out_of_stock);
  });

  it("treats negative inventory as out of stock", () => {
    const result = scoreProduct(
      perfectProduct({ variants: [variant({ inventoryQuantity: -2 })] }),
    );
    expect(check(result, "out_of_stock").status).toBe("fail");
  });

  it("flags a low-stock variant using the threshold", () => {
    const low = scoreProduct(
      perfectProduct({ variants: [variant({ inventoryQuantity: 3 })] }),
    );
    expect(check(low, "low_stock").status).toBe("warn");
    expect(low.score).toBe(100 - WEIGHTS.low_stock);

    const custom = scoreProduct(
      perfectProduct({ variants: [variant({ inventoryQuantity: 3 })] }),
      { lowStockThreshold: 2 },
    );
    expect(check(custom, "low_stock").status).toBe("pass");
  });

  it("ignores untracked variants for inventory checks", () => {
    const result = scoreProduct(
      perfectProduct({
        variants: [variant({ tracked: false, inventoryQuantity: 0 })],
      }),
    );
    expect(check(result, "out_of_stock").status).toBe("pass");
    expect(check(result, "low_stock").status).toBe("pass");
  });

  it("does not penalize a single Default Title variant", () => {
    const result = scoreProduct(perfectProduct());
    expect(check(result, "variant_options").status).toBe("pass");
  });

  it("fails multiple variants with only the default option", () => {
    const result = scoreProduct(
      perfectProduct({
        variantCount: 2,
        variants: [variant(), variant()],
      }),
    );
    expect(check(result, "variant_options").status).toBe("fail");
  });

  it("fails placeholder titles and non-active / unpublished products", () => {
    const result = scoreProduct(
      perfectProduct({
        title: "Untitled",
        status: "DRAFT",
        publishedToOnlineStore: false,
      }),
    );
    expect(check(result, "title").status).toBe("fail");
    expect(check(result, "status_active").status).toBe("fail");
    expect(check(result, "online_store").status).toBe("fail");
    expect(result.score).toBe(100 - 8 - 5 - 5);
  });

  it("reports multiple issues at once", () => {
    const result = scoreProduct(
      perfectProduct({
        description: "",
        imageCount: 0,
        seoTitle: null,
        seoDescription: null,
        variants: [variant({ price: 0, inventoryQuantity: 0 })],
      }),
    );
    expect(result.issues.map((i) => i.id).sort()).toEqual(
      [
        "description",
        "images",
        "out_of_stock",
        "seo_description",
        "seo_title",
        "variant_prices",
      ].sort(),
    );
    expect(result.score).toBe(100 - 12 - 10 - 10 - 10 - 15 - 10);
    expect(result.issues.every((i) => i.fix.length > 0)).toBe(true);
  });

  it("notes when only some variants were checked", () => {
    const result = scoreProduct(
      perfectProduct({
        variantCount: 250,
        options: [{ name: "Size", values: ["S", "M"] }],
      }),
    );
    expect(check(result, "variant_prices").message).toMatch(/first 1 of 250/);
  });

  it("keeps scores within 0-100", () => {
    const worst = scoreProduct({
      id: "gid://shopify/Product/2",
      title: "",
      status: "ARCHIVED",
      description: "",
      imageCount: 0,
      seoTitle: null,
      seoDescription: null,
      options: [],
      variants: [],
      variantCount: 3,
      publishedToOnlineStore: false,
    });
    // Inventory checks pass when nothing is tracked, so the floor is 15.
    expect(worst.score).toBe(15);

    const trulyWorst = scoreProduct({
      ...perfectProduct(),
      title: "",
      status: "ARCHIVED",
      description: "",
      imageCount: 0,
      seoTitle: null,
      seoDescription: null,
      options: [],
      variantCount: 2,
      variants: [
        variant({ price: 0, inventoryQuantity: 0 }),
        variant({ price: null, inventoryQuantity: 0 }),
      ],
      publishedToOnlineStore: false,
    });
    // Low stock still passes when every variant is fully out of stock.
    expect(trulyWorst.score).toBe(WEIGHTS.low_stock);

    for (let i = 0; i < 50; i++) {
      const n = (i * 7919) % 101;
      const r = scoreProduct(
        perfectProduct({
          description: "x".repeat(n),
          imageCount: i % 5,
          seoTitle: i % 2 ? null : "y".repeat(n),
          variants: [
            variant({ price: i % 3 ? n : 0, inventoryQuantity: (i % 7) - 1 }),
          ],
        }),
      );
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.score)).toBe(true);
    }
  });
});
