import { describe, expect, it } from "vitest";
import { MAX_INVENTORY_ADJUSTMENT, SEO_BATCH_MAX } from "../config";
import { scoreProduct } from "../product-health";
import { perfectProduct, variant } from "../product-health/test-fixtures";
import {
  describeInventoryChange,
  describeSeoBatch,
  describeSeoChange,
  describeStatusChange,
  writeErrorMessage,
} from "./messages";
import { parseIntegerInput, planInventoryAdjustment } from "./inventory";
import {
  isPlaceholderSeo,
  normalizeText,
  planSeoUpdate,
  suggestSeo,
  truncateAtWord,
} from "./seo";
import { planSeoBatch } from "./seo-batch";
import { criticalIssues, planStatusChange } from "./status";

const empty = { title: "", description: "" };
const goodDescription =
  "Heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.";

describe("planSeoUpdate", () => {
  it("accepts a valid change and reports before/after", () => {
    const plan = planSeoUpdate({
      current: { title: null, description: null },
      next: { title: "Organic Hoodie | ZJ", description: goodDescription },
    });
    expect(plan.valid).toBe(true);
    expect(plan.summary.title).toEqual({
      before: "",
      after: "Organic Hoodie | ZJ",
    });
    expect(plan.requiresExtraConfirmation).toBe(false);
  });

  it("trims and collapses whitespace", () => {
    const plan = planSeoUpdate({
      current: empty,
      next: {
        title: "  Organic   Hoodie \n",
        description: `  ${goodDescription}  `,
      },
    });
    expect(plan.values).toEqual({
      title: "Organic Hoodie",
      description: goodDescription,
    });
  });

  it("enforces the 70 / 160 character limits at the boundary", () => {
    const at = planSeoUpdate({
      current: empty,
      next: { title: "a".repeat(70), description: "b ".repeat(80).trim() },
    });
    expect(at.valid).toBe(true);

    const over = planSeoUpdate({
      current: empty,
      next: { title: "a".repeat(71), description: "b".repeat(161) },
    });
    expect(over.errors.map((e) => e.field)).toEqual(["title", "description"]);
    expect(over.errors[0].message).toMatch(/71 characters; the limit is 70/);
  });

  it("rejects empty values", () => {
    const plan = planSeoUpdate({
      current: empty,
      next: { title: "   ", description: "" },
    });
    expect(plan.errors).toEqual([
      { field: "title", message: "SEO title can't be empty." },
      { field: "description", message: "SEO description can't be empty." },
    ]);
  });

  it.each([
    "Untitled",
    "lorem ipsum dolor",
    "TODO",
    "SEO title",
    "test product",
  ])("rejects placeholder %s", (title) => {
    const plan = planSeoUpdate({
      current: empty,
      next: { title, description: goodDescription },
    });
    expect(plan.errors[0]).toMatchObject({ field: "title" });
    expect(isPlaceholderSeo(title)).toBe(true);
  });

  it("rejects a no-op change", () => {
    const current = { title: "Hoodie | ZJ", description: goodDescription };
    const plan = planSeoUpdate({ current, next: { ...current } });
    expect(plan.errors).toEqual([expect.objectContaining({ field: "form" })]);
  });

  it("warns on short descriptions without blocking", () => {
    const plan = planSeoUpdate({
      current: empty,
      next: { title: "Hoodie", description: "Warm hoodie." },
    });
    expect(plan.valid).toBe(true);
    expect(plan.warnings[0]).toMatch(/50-160/);
  });
});

describe("suggestSeo", () => {
  it("uses 'title | vendor' when it fits", () => {
    expect(
      suggestSeo({ title: "Organic Hoodie", vendor: "ZJ", description: "" })
        .title,
    ).toBe("Organic Hoodie | ZJ");
  });

  it("drops the vendor when it would exceed 70 chars or repeats the title", () => {
    const long =
      "An Exceptionally Long Product Title That Nearly Fills The Limit";
    expect(
      suggestSeo({
        title: long,
        vendor: "Very Long Vendor Name",
        description: "",
      }).title,
    ).toBe(long);
    expect(
      suggestSeo({ title: "ZJ", vendor: "zj", description: "" }).title,
    ).toBe("ZJ");
  });

  it("truncates an over-long title at a word boundary", () => {
    const title = "word ".repeat(30).trim();
    const suggested = suggestSeo({ title, vendor: "", description: "" }).title;
    expect(suggested.length).toBeLessThanOrEqual(70);
    expect(suggested.endsWith("…")).toBe(true);
    expect(suggested).not.toMatch(/wor…$/);
  });

  it("builds the description from the first sentence(s)", () => {
    const description =
      "Soft fleece. Made from organic cotton grown in Portugal and knitted locally. Machine washable at 30 degrees. Ships in recycled packaging.";
    const suggested = suggestSeo({
      title: "Hoodie",
      vendor: "ZJ",
      description,
    }).description;
    expect(suggested).toBe(
      "Soft fleece. Made from organic cotton grown in Portugal and knitted locally.",
    );
    expect(suggested.length).toBeLessThanOrEqual(160);
  });

  it("truncates one very long sentence at a word boundary", () => {
    const description = `${"lovely ".repeat(40)}hoodie.`;
    const suggested = suggestSeo({
      title: "Hoodie",
      vendor: "",
      description,
    }).description;
    expect(suggested.length).toBeLessThanOrEqual(160);
    expect(suggested.endsWith("…")).toBe(true);
  });

  it("falls back to a generic line without a description", () => {
    expect(
      suggestSeo({ title: "Hoodie", vendor: "ZJ", description: "  " })
        .description,
    ).toBe("Shop Hoodie by ZJ.");
  });

  it("is deterministic and always passes its own validation for real input", () => {
    const input = {
      title: "Organic Hoodie",
      vendor: "ZJ",
      description: goodDescription,
    };
    expect(suggestSeo(input)).toEqual(suggestSeo(input));
    const plan = planSeoUpdate({ current: empty, next: suggestSeo(input) });
    expect(plan.valid).toBe(true);
  });

  it("helpers normalise and cut cleanly", () => {
    expect(normalizeText(" a \n\t b ")).toBe("a b");
    expect(truncateAtWord("short", 10)).toBe("short");
  });
});

describe("planStatusChange", () => {
  const healthy = scoreProduct(perfectProduct({ status: "DRAFT" })).checks;

  it("allows DRAFT -> ACTIVE and ACTIVE -> DRAFT", () => {
    expect(
      planStatusChange({ current: "DRAFT", next: "ACTIVE", checks: healthy }),
    ).toMatchObject({
      valid: true,
      requiresExtraConfirmation: false,
      summary: { before: "DRAFT", after: "ACTIVE" },
    });
    expect(
      planStatusChange({ current: "ACTIVE", next: "DRAFT", checks: healthy })
        .valid,
    ).toBe(true);
  });

  it("rejects same-status, archived and unknown transitions", () => {
    expect(
      planStatusChange({ current: "ACTIVE", next: "ACTIVE", checks: healthy })
        .errors[0].message,
    ).toMatch(/already active/);
    expect(
      planStatusChange({ current: "ARCHIVED", next: "ACTIVE", checks: healthy })
        .valid,
    ).toBe(false);
    expect(
      planStatusChange({ current: "DRAFT", next: "ARCHIVED", checks: healthy })
        .valid,
    ).toBe(false);
  });

  it("requires extra confirmation to activate a product failing critical checks", () => {
    const checks = scoreProduct(
      perfectProduct({
        status: "DRAFT",
        imageCount: 0,
        description: "",
        variants: [variant({ price: 0 })],
      }),
    ).checks;
    const plan = planStatusChange({ current: "DRAFT", next: "ACTIVE", checks });
    expect(plan.valid).toBe(true);
    expect(plan.requiresExtraConfirmation).toBe(true);
    expect(plan.warnings).toEqual([
      "It has no description.",
      "It has no images.",
      "At least one variant has no price or a price of 0.",
    ]);
    expect(criticalIssues(checks)).toHaveLength(3);
  });

  it("never needs extra confirmation to move to draft", () => {
    const checks = scoreProduct(perfectProduct({ imageCount: 0 })).checks;
    expect(
      planStatusChange({ current: "ACTIVE", next: "DRAFT", checks })
        .requiresExtraConfirmation,
    ).toBe(false);
  });
});

describe("planInventoryAdjustment", () => {
  it("computes a before/after summary", () => {
    expect(planInventoryAdjustment({ expected: 4, next: 10 })).toMatchObject({
      valid: true,
      summary: { before: 4, after: 10, delta: 6 },
      requiresExtraConfirmation: false,
    });
  });

  it("rejects non-integers, negatives and no-ops", () => {
    expect(
      planInventoryAdjustment({ expected: 4, next: null }).errors[0].message,
    ).toMatch(/whole number/);
    expect(
      planInventoryAdjustment({ expected: 4, next: -1 }).errors[0].message,
    ).toMatch(/below 0/);
    expect(planInventoryAdjustment({ expected: 4, next: 4 }).valid).toBe(false);
    expect(parseIntegerInput("2.5")).toBeNull();
    expect(parseIntegerInput("abc")).toBeNull();
    expect(parseIntegerInput(" 12 ")).toBe(12);
  });

  it("enforces the max single adjustment at the boundary", () => {
    expect(MAX_INVENTORY_ADJUSTMENT).toBe(1000);
    expect(planInventoryAdjustment({ expected: 0, next: 1000 }).valid).toBe(
      true,
    );
    expect(planInventoryAdjustment({ expected: 0, next: 1001 }).valid).toBe(
      false,
    );
    expect(planInventoryAdjustment({ expected: 1001, next: 0 }).valid).toBe(
      false,
    );
  });

  it("requires extra confirmation for large changes and zeroing stock", () => {
    expect(
      planInventoryAdjustment({ expected: 0, next: 101 })
        .requiresExtraConfirmation,
    ).toBe(true);
    expect(planInventoryAdjustment({ expected: 5, next: 0 })).toMatchObject({
      valid: true,
      requiresExtraConfirmation: true,
    });
  });

  it("allows correcting an oversold (negative) level up to 0+", () => {
    expect(planInventoryAdjustment({ expected: -3, next: 2 })).toMatchObject({
      valid: true,
      summary: { delta: 5 },
    });
  });
});

describe("planSeoBatch", () => {
  const product = (id: string, seoTitle: string | null) => ({
    id,
    title: `Hoodie ${id}`,
    vendor: "ZJ",
    description: goodDescription,
    seoTitle,
    seoDescription: null,
  });

  it("caps the batch and reports how many were skipped", () => {
    const products = Array.from({ length: 13 }, (_, i) =>
      product(String(i), null),
    );
    const { items, skipped } = planSeoBatch(products);
    expect(SEO_BATCH_MAX).toBe(10);
    expect(items).toHaveLength(10);
    expect(skipped).toBe(3);
  });

  it("only fills missing fields and keeps existing values", () => {
    const { items } = planSeoBatch([product("1", "Existing Title")]);
    expect(items[0].values.title).toBe("Existing Title");
    expect(items[0].values.description).not.toBe("");
    expect(items[0].expected).toEqual({
      title: "Existing Title",
      description: "",
    });
  });
});

describe("messages", () => {
  it("uses explicit confirmation wording", () => {
    expect(describeSeoChange("Hoodie")).toBe(
      'This will update the SEO title and description for "Hoodie".',
    );
    expect(describeStatusChange("Hoodie", "ACTIVE")).toMatch(
      /set "Hoodie" to Active/,
    );
    expect(describeStatusChange("Hoodie", "DRAFT")).toMatch(
      /hidden from all sales channels/,
    );
    expect(
      describeInventoryChange("Hoodie – M", "Warehouse", {
        before: 4,
        after: 10,
        delta: 6,
      }),
    ).toBe(
      'This will change available stock for "Hoodie – M" at Warehouse from 4 to 10 (+6).',
    );
    expect(describeSeoBatch(8)).toBe("This will update SEO for 8 products.");
  });

  it("has fixed, friendly copy for every error code", () => {
    expect(writeErrorMessage("permission_needed")).toMatch(
      /approve the new permissions/,
    );
    expect(writeErrorMessage("conflict")).toMatch(/changed in Shopify/);
  });
});
