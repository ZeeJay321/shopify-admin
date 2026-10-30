import { describe, expect, it } from "vitest";
import { ShopifyApiError } from "./errors";
import { toNumericId, toProductGid } from "./gid";

describe("toProductGid", () => {
  it("accepts numeric ids and Product GIDs", () => {
    expect(toProductGid("123")).toBe("gid://shopify/Product/123");
    expect(toProductGid("gid://shopify/Product/123")).toBe(
      "gid://shopify/Product/123",
    );
  });

  it.each([
    undefined,
    "",
    "0",
    "abc",
    "12a",
    "gid://shopify/ProductVariant/123",
    "gid://shopify/Order/123",
    "gid://shopify/Product/",
    "../123",
  ])("rejects %s with invalid_id", (value) => {
    try {
      toProductGid(value);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ShopifyApiError);
      expect((e as ShopifyApiError).kind).toBe("invalid_id");
    }
  });
});

describe("toNumericId", () => {
  it("extracts the numeric id", () => {
    expect(toNumericId("gid://shopify/Product/42")).toBe("42");
  });

  it("rejects non-product GIDs", () => {
    expect(() => toNumericId("gid://shopify/Collection/42")).toThrow(
      ShopifyApiError,
    );
  });
});
