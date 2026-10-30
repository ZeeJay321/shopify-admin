import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfectProduct, variant } from "../product-health/test-fixtures";
import type { AdminGraphqlClient } from "../shopify/client";
import { ShopifyApiError } from "../shopify/errors";
import type { ProductRecord } from "../shopify/snapshot";

const { getProduct } = vi.hoisted(() => ({ getProduct: vi.fn() }));
vi.mock("../shopify/products.server", () => ({ getProduct }));

import { MemoryTaggedCache } from "../cache/memory-cache";
import { webhookHandlers } from "../webhooks/handlers";
import { loadHealthSummary } from "./summary.server";

const client: AdminGraphqlClient = {
  graphql: vi.fn(async () => new Response("{}")),
};

function record(
  overrides: Partial<ProductRecord["snapshot"]> = {},
): ProductRecord {
  return {
    snapshot: perfectProduct({ id: "gid://shopify/Product/42", ...overrides }),
    handle: "hoodie",
    vendor: "ZJ",
    imageUrl: null,
    imageAlt: null,
    inventoryItemIds: ["9001"],
    inAnyCollection: true,
  };
}

const RAW_DETAIL = "Field 'secret' doesn't exist; token=shpat_abc";

beforeEach(() => {
  getProduct.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("loadHealthSummary", () => {
  it("returns a compact summary for a product", async () => {
    getProduct.mockResolvedValue(
      record({
        description: "",
        seoTitle: null,
        seoDescription: null,
        variants: [variant({ inventoryQuantity: 0 })],
      }),
    );

    const result = await loadHealthSummary(client, "42");

    expect(getProduct).toHaveBeenCalledWith(client, "gid://shopify/Product/42");
    expect(result.status).toBe(200);
    if (!result.body.ok) throw new Error("expected success");
    expect(result.body).toMatchObject({
      product: { id: "42", title: "Organic Cotton Hoodie" },
      score: 100 - 12 - 10 - 10 - 10,
      scoreTone: "warning",
      issueCount: 4,
      reportPath: "/app/products/42",
    });
    expect(result.body.topIssues).toHaveLength(3);
    expect(result.body.topIssues[0]).toEqual({
      id: "description",
      label: "Description",
      status: "fail",
      message: "Product has no description.",
    });
    expect(
      result.body.groups.map((g) => [g.id, g.status, g.issueCount]),
    ).toEqual([
      ["content", "fail", 1],
      ["seo", "fail", 2],
      ["variants", "pass", 0],
      ["inventory", "fail", 1],
      ["publishing", "pass", 0],
    ]);
  });

  it("accepts a full Product GID", async () => {
    getProduct.mockResolvedValue(record());
    const result = await loadHealthSummary(client, "gid://shopify/Product/42");
    expect(result.status).toBe(200);
    expect(result.body.ok && result.body.issueCount).toBe(0);
  });

  it.each([undefined, "abc", "gid://shopify/Order/42"])(
    "returns 400 for invalid id %s without calling Shopify",
    async (id) => {
      const result = await loadHealthSummary(client, id);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: "invalid_id" },
      });
      expect(getProduct).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["not_found", 404, "not_found"],
    ["access_denied", 403, "access_denied"],
    ["throttled", 429, "throttled"],
    ["graphql", 502, "upstream"],
    ["http", 502, "upstream"],
  ] as const)(
    "maps %s to HTTP %i with merchant-safe copy",
    async (kind, status, code) => {
      getProduct.mockRejectedValue(
        new ShopifyApiError(kind, "Product detail", RAW_DETAIL),
      );

      const result = await loadHealthSummary(client, "42");

      expect(result.status).toBe(status);
      expect(result.body).toMatchObject({ ok: false, error: { code } });
      const serialized = JSON.stringify(result.body);
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("shpat_");
      expect(result.headers?.["Retry-After"]).toBe(
        status === 429 ? "5" : undefined,
      );
    },
  );

  it("re-throws non-Shopify errors (auth responses, bugs)", async () => {
    const reauth = new Response(null, { status: 401 });
    getProduct.mockRejectedValue(reauth);
    await expect(loadHealthSummary(client, "42")).rejects.toBe(reauth);
  });

  it("reads through the cache and reloads after a webhook for that product", async () => {
    getProduct.mockResolvedValue(record());
    const shop = "zj.myshopify.com";
    const cache = new MemoryTaggedCache();
    const cached = { shop, cache };

    await loadHealthSummary(client, "42", cached);
    await loadHealthSummary(client, "42", cached);
    expect(getProduct).toHaveBeenCalledTimes(1);

    // inventory_levels/update for one of this product's items (record() uses 9001)
    await webhookHandlers.INVENTORY_LEVELS_UPDATE({
      shop,
      payload: { inventory_item_id: 9001 },
      cache,
    });
    await loadHealthSummary(client, "42", cached);
    expect(getProduct).toHaveBeenCalledTimes(2);

    await webhookHandlers.PRODUCTS_UPDATE({ shop, payload: { id: 42 }, cache });
    await loadHealthSummary(client, "42", cached);
    expect(getProduct).toHaveBeenCalledTimes(3);

    // Another shop never sees this shop's entry.
    await loadHealthSummary(client, "42", {
      shop: "other.myshopify.com",
      cache,
    });
    expect(getProduct).toHaveBeenCalledTimes(4);
  });

  it("does not cache errors", async () => {
    const cache = new MemoryTaggedCache();
    getProduct.mockRejectedValueOnce(
      new ShopifyApiError("throttled", "Product detail", "busy"),
    );
    getProduct.mockResolvedValueOnce(record());
    const cached = { shop: "zj.myshopify.com", cache };

    expect((await loadHealthSummary(client, "42", cached)).status).toBe(429);
    expect((await loadHealthSummary(client, "42", cached)).status).toBe(200);
  });
});
