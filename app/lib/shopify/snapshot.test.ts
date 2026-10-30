import { describe, expect, it } from "vitest";
import type { ProductNode } from "./snapshot";
import { parsePrice, toProductRecord } from "./snapshot";

function node(overrides: Partial<ProductNode> = {}): ProductNode {
  return {
    id: "gid://shopify/Product/7",
    title: "Hoodie",
    handle: "hoodie",
    vendor: "ZJ",
    status: "ACTIVE" as ProductNode["status"],
    description: "Warm.",
    onlineStoreUrl: "https://zj.example/products/hoodie",
    seo: { title: null, description: "Meta" },
    options: [{ name: "Size", values: ["S", "M"] }],
    mediaCount: { count: 2 },
    featuredMedia: {
      preview: { image: { url: "https://cdn.example/h.jpg", altText: null } },
    },
    variantsCount: { count: 3 },
    collections: { nodes: [{ id: "gid://shopify/Collection/9" }] },
    variants: {
      nodes: [
        {
          title: "S",
          price: "19.99",
          inventoryQuantity: 4,
          inventoryItem: {
            id: "gid://shopify/InventoryItem/501",
            tracked: true,
          },
        },
        {
          title: "M",
          price: "0.00",
          inventoryQuantity: null,
          inventoryItem: {
            id: "gid://shopify/InventoryItem/502",
            tracked: false,
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("toProductRecord", () => {
  it("maps a GraphQL product node to a snapshot", () => {
    const record = toProductRecord(node());
    expect(record.snapshot).toEqual({
      id: "gid://shopify/Product/7",
      title: "Hoodie",
      status: "ACTIVE",
      description: "Warm.",
      imageCount: 2,
      seoTitle: null,
      seoDescription: "Meta",
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { title: "S", price: 19.99, inventoryQuantity: 4, tracked: true },
        { title: "M", price: 0, inventoryQuantity: null, tracked: false },
      ],
      variantCount: 3,
      publishedToOnlineStore: true,
    });
    expect(record.imageUrl).toBe("https://cdn.example/h.jpg");
    expect(record.handle).toBe("hoodie");
    expect(record.inventoryItemIds).toEqual(["501", "502"]);
    expect(record.inAnyCollection).toBe(true);
    expect(
      toProductRecord(node({ collections: { nodes: [] } })).inAnyCollection,
    ).toBe(false);
  });

  it("handles missing optional fields", () => {
    const record = toProductRecord(
      node({
        onlineStoreUrl: null,
        mediaCount: null,
        featuredMedia: null,
        variantsCount: null,
      }),
    );
    expect(record.snapshot.publishedToOnlineStore).toBe(false);
    expect(record.snapshot.imageCount).toBe(0);
    expect(record.snapshot.variantCount).toBe(2);
    expect(record.imageUrl).toBeNull();
  });
});

describe("parsePrice", () => {
  it.each([
    ["19.99", 19.99],
    ["0", 0],
    [12, 12],
    ["", null],
    ["abc", null],
    [null, null],
    [undefined, null],
  ])("parses %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });
});
