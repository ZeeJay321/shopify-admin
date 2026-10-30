import type { ProductSnapshot, VariantSnapshot } from "./types";

export function variant(
  overrides: Partial<VariantSnapshot> = {},
): VariantSnapshot {
  return {
    title: "Default Title",
    price: 25,
    inventoryQuantity: 50,
    tracked: true,
    ...overrides,
  };
}

/** A product that passes every check. */
export function perfectProduct(
  overrides: Partial<ProductSnapshot> = {},
): ProductSnapshot {
  return {
    id: "gid://shopify/Product/1",
    title: "Organic Cotton Hoodie",
    status: "ACTIVE",
    description:
      "A heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.",
    imageCount: 4,
    seoTitle: "Organic Cotton Hoodie | ZJ",
    seoDescription:
      "Heavyweight organic cotton hoodie with brushed fleece interior. Free shipping over $50.",
    options: [{ name: "Title", values: ["Default Title"] }],
    variants: [variant()],
    variantCount: 1,
    publishedToOnlineStore: true,
    ...overrides,
  };
}
