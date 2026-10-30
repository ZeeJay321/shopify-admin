import { describe, expect, it, vi } from "vitest";
import type { AdminGraphqlClient } from "./client";
import { ShopifyApiError } from "./errors";
import {
  getInventoryPage,
  getInventorySample,
  getLocations,
  inventorySearchQuery,
} from "./inventory.server";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

function variantNode(n: number, available: number, tracked = true) {
  return {
    id: `gid://shopify/ProductVariant/${n}`,
    title: `Size ${n}`,
    product: { id: `gid://shopify/Product/${100 + n}`, title: `Tee ${n}` },
    inventoryItem: {
      id: `gid://shopify/InventoryItem/${500 + n}`,
      tracked,
      inventoryLevels: {
        nodes: [
          {
            location: { id: "gid://shopify/Location/1", name: "Warehouse" },
            quantities: [{ name: "available", quantity: available }],
          },
        ],
      },
    },
  };
}

/** Fake connection over `total` variants; reads first/after from variables. */
function variantsClient(total: number) {
  const graphql = vi.fn(
    async (
      _query: string,
      options?: { variables?: Record<string, unknown> },
    ) => {
      const vars = options?.variables ?? {};
      const start = typeof vars.after === "string" ? Number(vars.after) : 0;
      const first = typeof vars.first === "number" ? vars.first : 50;
      const end = Math.min(start + first, total);
      const nodes = [];
      for (let n = start; n < end; n++) nodes.push(variantNode(n, n));
      return json({
        data: {
          productVariants: {
            nodes,
            pageInfo: {
              hasNextPage: end < total,
              hasPreviousPage: start > 0,
              startCursor: String(start),
              endCursor: String(end),
            },
          },
        },
      });
    },
  );
  const client: AdminGraphqlClient = { graphql };
  return { client, graphql };
}

describe("getInventoryPage", () => {
  it("maps variants with per-location levels to plain records", async () => {
    const { client, graphql } = variantsClient(2);
    const page = await getInventoryPage(client, { locationId: "1" });

    expect(page.variants[0]).toEqual({
      variantId: "0",
      inventoryItemId: "500",
      variantTitle: "Size 0",
      productId: "100",
      productTitle: "Tee 0",
      tracked: true,
      levels: [{ locationId: "1", locationName: "Warehouse", available: 0 }],
    });
    expect(graphql.mock.calls[0][1]?.variables).toMatchObject({
      first: 50,
      after: null,
      query: "product_status:active,draft location_id:1",
      levelsFirst: 10,
    });
  });

  it("pages backwards with last/before", async () => {
    const { client, graphql } = variantsClient(10);
    await getInventoryPage(client, {
      cursor: "abc",
      direction: "prev",
      pageSize: 5,
    });
    expect(graphql.mock.calls[0][1]?.variables).toMatchObject({
      last: 5,
      before: "abc",
    });
  });
});

describe("getInventorySample", () => {
  it("follows cursors across pages", async () => {
    const { client, graphql } = variantsClient(120);
    const { variants, capped } = await getInventorySample(client, 500);
    expect(variants).toHaveLength(120);
    expect(capped).toBe(false);
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("respects the cap", async () => {
    const { client, graphql } = variantsClient(1000);
    const { variants, capped } = await getInventorySample(client, 75);
    expect(variants).toHaveLength(75);
    expect(capped).toBe(true);
    expect(graphql.mock.calls.map((c) => c[1]?.variables?.first)).toEqual([
      50, 25,
    ]);
  });

  it("surfaces GraphQL errors as typed errors", async () => {
    const client: AdminGraphqlClient = {
      graphql: vi.fn(async () =>
        json({ errors: [{ message: "Field 'quantities' doesn't exist" }] }),
      ),
    };
    await expect(getInventorySample(client)).rejects.toMatchObject({
      kind: "graphql",
    });
  });

  it("maps a missing read_inventory scope to access_denied", async () => {
    const client: AdminGraphqlClient = {
      graphql: vi.fn(async () =>
        json({
          data: null,
          errors: [
            {
              message:
                "Access denied for inventoryLevels field. Required access: `read_inventory`.",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        }),
      ),
    };
    const error = await getInventorySample(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShopifyApiError);
    expect((error as ShopifyApiError).kind).toBe("access_denied");
  });
});

describe("getLocations", () => {
  it("paginates and maps location ids", async () => {
    const pages = [
      {
        nodes: [{ id: "gid://shopify/Location/1", name: "Warehouse" }],
        pageInfo: { hasNextPage: true, endCursor: "c1" },
      },
      {
        nodes: [{ id: "gid://shopify/Location/2", name: "Store" }],
        pageInfo: { hasNextPage: false, endCursor: "c2" },
      },
    ];
    const client: AdminGraphqlClient = {
      graphql: vi.fn(async () => json({ data: { locations: pages.shift() } })),
    };
    expect(await getLocations(client)).toEqual({
      locations: [
        { id: "1", name: "Warehouse" },
        { id: "2", name: "Store" },
      ],
      capped: false,
    });
  });
});

describe("inventorySearchQuery", () => {
  it("excludes archived products and adds the location filter", () => {
    expect(inventorySearchQuery()).toBe("product_status:active,draft");
    expect(inventorySearchQuery("7")).toBe(
      "product_status:active,draft location_id:7",
    );
  });
});
