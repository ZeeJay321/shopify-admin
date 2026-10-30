import { describe, expect, it, vi } from "vitest";
import type { AdminGraphqlClient } from "../client";
import { ShopifyApiError } from "../errors";
import {
  adjustInventory,
  mapInventoryUserError,
  referenceDocumentUri,
} from "./inventory.server";
import {
  mapProductUserErrors,
  setProductStatus,
  updateProductSeo,
} from "./product.server";

const KEY = "3f5b6ebf-143c-4da5-8d0f-fb8553bfd85d";

function client(body: unknown) {
  const graphql = vi.fn(async () => new Response(JSON.stringify(body)));
  const c: AdminGraphqlClient = { graphql };
  return { client: c, graphql };
}

const accessDenied = {
  errors: [
    {
      message:
        "Access denied for productUpdate field. Required access: `write_products`.",
      extensions: { code: "ACCESS_DENIED" },
    },
  ],
};

describe("updateProductSeo", () => {
  it("sends productUpdate with SEO and returns the saved values", async () => {
    const { client: c, graphql } = client({
      data: {
        productUpdate: {
          product: {
            id: "gid://shopify/Product/42",
            seo: { title: "T", description: "D" },
          },
          userErrors: [],
        },
      },
    });
    const result = await updateProductSeo(c, "42", {
      title: "T",
      description: "D",
    });
    expect(result).toEqual({
      ok: true,
      data: { title: "T", description: "D" },
    });
    const [query, options] = graphql.mock.calls[0] as unknown as [
      string,
      { variables: Record<string, unknown> },
    ];
    expect(query).toContain("productUpdate(product: $product)");
    expect(options.variables).toEqual({
      product: {
        id: "gid://shopify/Product/42",
        seo: { title: "T", description: "D" },
      },
    });
  });

  it("maps a userError on seo.title to a field validation error", async () => {
    const { client: c } = client({
      data: {
        productUpdate: {
          product: null,
          userErrors: [
            { field: ["product", "seo", "title"], message: "is too long" },
          ],
        },
      },
    });
    expect(
      await updateProductSeo(c, "42", { title: "x", description: "y" }),
    ).toEqual({
      ok: false,
      error: {
        code: "validation",
        field: "title",
        detail: "product.seo.title: is too long",
      },
    });
  });

  it("maps a missing product to not_found", async () => {
    const { client: c } = client({
      data: {
        productUpdate: {
          product: null,
          userErrors: [{ field: ["id"], message: "Product does not exist" }],
        },
      },
    });
    const result = await updateProductSeo(c, "42", {
      title: "x",
      description: "y",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("throws access_denied when write_products isn't granted", async () => {
    const { client: c } = client(accessDenied);
    await expect(
      updateProductSeo(c, "42", { title: "x", description: "y" }),
    ).rejects.toMatchObject({
      kind: "access_denied",
    });
  });

  it("rejects an invalid product id before calling Shopify", async () => {
    const { client: c, graphql } = client({});
    await expect(
      updateProductSeo(c, "gid://shopify/Order/42", {
        title: "x",
        description: "y",
      }),
    ).rejects.toBeInstanceOf(ShopifyApiError);
    expect(graphql).not.toHaveBeenCalled();
  });
});

describe("setProductStatus", () => {
  it("uses productUpdate (productChangeStatus is deprecated)", async () => {
    const { client: c, graphql } = client({
      data: {
        productUpdate: {
          product: { id: "gid://shopify/Product/42", status: "ACTIVE" },
          userErrors: [],
        },
      },
    });
    expect(await setProductStatus(c, "42", "ACTIVE")).toEqual({
      ok: true,
      data: { status: "ACTIVE" },
    });
    const [query, options] = graphql.mock.calls[0] as unknown as [
      string,
      { variables: Record<string, unknown> },
    ];
    expect(query).not.toContain("productChangeStatus");
    expect(options.variables).toEqual({
      product: { id: "gid://shopify/Product/42", status: "ACTIVE" },
    });
  });

  it("maps a status userError to validation", () => {
    expect(
      mapProductUserErrors([
        { field: ["product", "status"], message: "invalid" },
      ]),
    ).toMatchObject({
      code: "validation",
      field: "status",
    });
    expect(mapProductUserErrors([])).toBeNull();
  });
});

describe("adjustInventory", () => {
  const input = {
    inventoryItemId: "501",
    locationId: "7",
    expectedQuantity: 4,
    delta: 6,
    actionKey: KEY,
  };

  it("sends compare-and-set, reason, app reference URI and the idempotency key", async () => {
    const { client: c, graphql } = client({
      data: {
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: {
            reason: "correction",
            referenceDocumentUri: referenceDocumentUri(KEY),
            changes: [{ name: "available", delta: 6, quantityAfterChange: 10 }],
          },
          userErrors: [],
        },
      },
    });
    expect(await adjustInventory(c, input)).toEqual({
      ok: true,
      data: { quantityAfterChange: 10 },
    });

    const [query, options] = graphql.mock.calls[0] as unknown as [
      string,
      { variables: Record<string, unknown> },
    ];
    expect(query).toContain("@idempotent(key: $idempotencyKey)");
    expect(options.variables).toEqual({
      idempotencyKey: KEY,
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: `gid://zj-commerce-ops/InventoryAdjustment/${KEY}`,
        changes: [
          {
            inventoryItemId: "gid://shopify/InventoryItem/501",
            locationId: "gid://shopify/Location/7",
            delta: 6,
            changeFromQuantity: 4,
          },
        ],
      },
    });
  });

  it("maps a stale quantity to a conflict", async () => {
    const { client: c } = client({
      data: {
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: null,
          userErrors: [
            {
              code: "CHANGE_FROM_QUANTITY_STALE",
              field: ["input", "changes", "0", "changeFromQuantity"],
              message: "The quantity has changed",
            },
          ],
        },
      },
    });
    expect(await adjustInventory(c, input)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });

  it.each([
    ["CHANGE_FROM_QUANTITY_STALE", "conflict", undefined],
    ["IDEMPOTENCY_CONCURRENT_REQUEST", "conflict", undefined],
    ["INVALID_QUANTITY_TOO_LOW", "validation", "quantity"],
    ["INVALID_QUANTITY_TOO_HIGH", "validation", "quantity"],
    ["ITEM_NOT_STOCKED_AT_LOCATION", "not_found", "location"],
    ["INVALID_LOCATION", "not_found", "location"],
    ["INVALID_INVENTORY_ITEM", "not_found", undefined],
    ["NON_MUTABLE_INVENTORY_ITEM", "failed", undefined],
    ["IDEMPOTENCY_KEY_PARAMETER_MISMATCH", "failed", undefined],
    ["SERVICE_UNAVAILABLE", "failed", undefined],
  ])("maps %s to %s", (code, expected, field) => {
    expect(
      mapInventoryUserError([{ code, field: null, message: "raw" }]),
    ).toEqual({
      code: expected,
      field,
      detail: `${code}: raw`,
    });
  });

  it("throws access_denied without write_inventory", async () => {
    const { client: c } = client(accessDenied);
    await expect(adjustInventory(c, input)).rejects.toMatchObject({
      kind: "access_denied",
    });
  });

  it("surfaces throttling", async () => {
    const throttled = {
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    };
    const graphql = vi.fn(async () => new Response(JSON.stringify(throttled)));
    vi.useFakeTimers();
    const pending = adjustInventory({ graphql }, input).catch(
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await pending).toMatchObject({ kind: "throttled" });
    expect(graphql).toHaveBeenCalledTimes(2); // one retry for mutations
  });

  it("rejects invalid ids and action keys before calling Shopify", async () => {
    const { client: c, graphql } = client({});
    await expect(
      adjustInventory(c, {
        ...input,
        inventoryItemId: "gid://shopify/Product/1",
      }),
    ).rejects.toMatchObject({
      kind: "invalid_id",
    });
    await expect(
      adjustInventory(c, { ...input, locationId: "abc" }),
    ).rejects.toMatchObject({
      kind: "invalid_id",
    });
    await expect(
      adjustInventory(c, { ...input, actionKey: "not-a-uuid" }),
    ).rejects.toMatchObject({
      kind: "invalid_id",
    });
    expect(graphql).not.toHaveBeenCalled();
  });
});
