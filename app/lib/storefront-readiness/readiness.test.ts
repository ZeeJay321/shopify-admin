import { describe, expect, it } from "vitest";
import { perfectProduct, variant } from "../product-health/test-fixtures";
import { DEFAULT_CHECKS } from "./checks";
import { CheckRegistry, defaultRegistry, evaluateReadiness } from "./run";
import type {
  ReadinessCollection,
  ReadinessProduct,
  StorefrontCheck,
  StorefrontSnapshot,
} from "./types";

function product(
  id: string,
  overrides: Partial<ReadinessProduct> = {},
): ReadinessProduct {
  return {
    ...perfectProduct(),
    id,
    handle: `product-${id}`,
    inAnyCollection: true,
    ...overrides,
  };
}

const collection = (id: string, productCount = 3): ReadinessCollection => ({
  id,
  title: `Collection ${id}`,
  handle: `collection-${id}`,
  productCount,
});

function snapshot(
  products: ReadinessProduct[],
  collections: ReadinessCollection[] | null = [collection("c1")],
): StorefrontSnapshot {
  return {
    products,
    productsCapped: false,
    collections,
    collectionsCapped: false,
  };
}

function check(report: ReturnType<typeof evaluateReadiness>, id: string) {
  const found = report.checks.find((c) => c.id === id);
  if (!found) throw new Error(`missing check ${id}`);
  return found;
}

describe("default checks", () => {
  it("weights total 100 with unique ids", () => {
    expect(DEFAULT_CHECKS.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(() => defaultRegistry()).not.toThrow();
  });

  it("scores a ready store 100 with every check passing", () => {
    const report = evaluateReadiness(snapshot([product("1"), product("2")]));
    expect(report.score).toBe(100);
    expect(report.checks.every((c) => c.status === "pass")).toBe(true);
  });

  // Each row: check id, a product override that fails it.
  it.each([
    ["product_titles", { title: "" }],
    ["placeholder_titles", { title: "Untitled" }],
    ["descriptions", { description: "Short." }],
    ["images", { imageCount: 0 }],
    ["variant_prices", { variants: [variant({ price: 0 })] }],
    ["out_of_stock_only", { variants: [variant({ inventoryQuantity: 0 })] }],
    ["seo_titles", { seoTitle: null }],
    ["seo_descriptions", { seoDescription: "" }],
    ["handles", { handle: "" }],
    ["online_store", { publishedToOnlineStore: false }],
    ["products_in_collections", { inAnyCollection: false }],
  ] as const)(
    "%s fails for the affected product and names it",
    (id, override) => {
      const report = evaluateReadiness(
        snapshot([
          product("1"),
          product("2", override as Partial<ReadinessProduct>),
        ]),
      );
      const result = check(report, id);
      expect(result.score).toBe(0.5);
      expect(result.status).toBe("fail");
      expect(result.affectedCount).toBe(1);
      expect(result.affectedResources[0]).toMatchObject({
        kind: "product",
        id: "2",
      });
      expect(report.score).toBeLessThan(100);
    },
  );

  it("passes out_of_stock_only when inventory isn't tracked", () => {
    const report = evaluateReadiness(
      snapshot([
        product("1", {
          variants: [variant({ tracked: false, inventoryQuantity: 0 })],
        }),
      ]),
    );
    expect(check(report, "out_of_stock_only").status).toBe("pass");
  });

  it("only checks live (ACTIVE) products", () => {
    const report = evaluateReadiness(
      snapshot([
        product("1"),
        product("2", { status: "DRAFT", title: "", imageCount: 0 }),
      ]),
    );
    expect(report.score).toBe(100);
    expect(report.liveProductCount).toBe(1);
  });

  it("flags empty collections and a store without collections", () => {
    const some = evaluateReadiness(
      snapshot([product("1")], [collection("c1"), collection("c2", 0)]),
    );
    expect(check(some, "collections_non_empty")).toMatchObject({
      score: 0.5,
      affectedCount: 1,
      affectedResources: [{ kind: "collection", id: "c2" }],
    });

    const none = evaluateReadiness(snapshot([product("1")], []));
    expect(check(none, "collections_non_empty")).toMatchObject({
      score: 0,
      status: "fail",
    });
  });
});

describe("weighted score", () => {
  it("is Σ(weight × score) / Σ(weight) over applicable checks", () => {
    // Fail `variant_prices` (15) for 1 of 2 products -> lose 7.5 of 100.
    const report = evaluateReadiness(
      snapshot([
        product("1"),
        product("2", { variants: [variant({ price: 0 })] }),
      ]),
    );
    expect(report.score).toBe(Math.round(100 - 7.5));
  });

  it("returns null for an empty store when nothing applies", () => {
    const report = evaluateReadiness(snapshot([], null));
    expect(report.score).toBeNull();
    expect(report.checks.every((c) => c.status === "not_applicable")).toBe(
      true,
    );
  });

  it("scores an empty store with no collections on what applies", () => {
    const report = evaluateReadiness(snapshot([], []));
    // Only "collections exist" applies, and it fails.
    expect(report.score).toBe(0);
  });

  it("handles partial data: unknown collections make collection checks N/A", () => {
    const report = evaluateReadiness(
      snapshot([product("1", { inAnyCollection: null })], null),
    );
    expect(check(report, "collections_non_empty").status).toBe(
      "not_applicable",
    );
    expect(check(report, "products_in_collections").status).toBe(
      "not_applicable",
    );
    expect(report.score).toBe(100);
    expect(report.collectionCount).toBeNull();
  });

  it("caps the affected list but reports the full count", () => {
    const products = Array.from({ length: 30 }, (_, i) =>
      product(String(i), { imageCount: 0 }),
    );
    const result = check(
      evaluateReadiness(snapshot(products), DEFAULT_CHECKS, {
        affectedLimit: 5,
      }),
      "images",
    );
    expect(result.affectedCount).toBe(30);
    expect(result.affectedResources).toHaveLength(5);
  });

  it("uses warn between the warn threshold and 1", () => {
    const products = [
      product("1"),
      product("2"),
      product("3"),
      product("4", { seoTitle: null }),
    ];
    expect(
      check(evaluateReadiness(snapshot(products)), "seo_titles").status,
    ).toBe("warn");
  });
});

describe("registry extensibility", () => {
  const giftCardCheck: StorefrontCheck = {
    id: "custom_vendor",
    name: "Products have a vendor tag",
    description: "Custom check registered by one object.",
    group: "products",
    severity: "info",
    weight: 100,
    evaluate: () => ({ score: 0, affectedResources: [] }),
  };

  it("adding a custom check changes the score", () => {
    const store = snapshot([product("1")]);
    expect(evaluateReadiness(store).score).toBe(100);

    const registry = defaultRegistry().register(giftCardCheck);
    const report = evaluateReadiness(store, registry.list());
    expect(report.score).toBe(50); // 100 weight passing + 100 weight failing
    expect(report.checks.map((c) => c.id)).toContain("custom_vendor");
  });

  it("rejects duplicate ids and non-positive weights", () => {
    expect(() =>
      defaultRegistry().register({ ...giftCardCheck, id: "images" }),
    ).toThrow(/Duplicate/);
    expect(() =>
      new CheckRegistry().register({ ...giftCardCheck, weight: 0 }),
    ).toThrow(/weight/);
  });

  it("clamps out-of-range scores from custom checks", () => {
    const wild: StorefrontCheck = {
      ...giftCardCheck,
      evaluate: () => ({ score: 7, affectedResources: [] }),
    };
    expect(evaluateReadiness(snapshot([]), [wild]).checks[0].score).toBe(1);
  });
});
