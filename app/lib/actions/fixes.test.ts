import { describe, expect, it } from "vitest";
import { perfectProduct } from "../product-health/test-fixtures";
import { scoreProduct } from "../product-health";
import { adminOnlyReason, productFixes, readinessFix } from "./fixes";

describe("readinessFix", () => {
  it.each([
    ["seo_titles", "seo"],
    ["seo_descriptions", "seo"],
    ["online_store", "publish"],
    ["placeholder_titles", "edit"],
    ["descriptions", "edit"],
    ["out_of_stock_only", "adjust_stock"],
    ["images", "admin_only"],
    ["variant_prices", "admin_only"],
    ["collections_non_empty", "admin_only"],
  ])("%s -> %s", (id, kind) => {
    expect(readinessFix(id).kind).toBe(kind);
  });

  it("explains why there's no direct fix", () => {
    expect(readinessFix("variant_prices").reason).toMatch(/too risky/);
    expect(readinessFix("images").reason).toMatch(/uploaded/);
  });
});

describe("productFixes", () => {
  it("offers activate for healthy drafts only", () => {
    const draft = perfectProduct({ status: "DRAFT" });
    expect(productFixes("DRAFT", scoreProduct(draft).checks)).toEqual([
      "activate",
    ]);
    const noImages = perfectProduct({ status: "DRAFT", imageCount: 0 });
    const fixes = productFixes("DRAFT", scoreProduct(noImages).checks);
    expect(fixes).not.toContain("activate");
    expect(fixes).toContain("admin_only");
    expect(adminOnlyReason(scoreProduct(noImages).checks)).toMatch(/uploaded/);
  });

  it("maps SEO, content and stock issues", () => {
    const product = perfectProduct({ seoTitle: null, description: "" });
    expect(productFixes("ACTIVE", scoreProduct(product).checks)).toEqual([
      "edit",
      "seo",
    ]);
    expect(
      productFixes("ACTIVE", scoreProduct(perfectProduct()).checks),
    ).toEqual([]);
  });
});
