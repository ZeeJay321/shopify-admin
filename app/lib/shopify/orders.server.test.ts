import { describe, expect, it, vi } from "vitest";
import type { AdminGraphqlClient } from "./client";
import {
  getOrderCounts,
  getOrdersPage,
  getRecentOrdersSample,
} from "./orders.server";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

function orderNode(n: number) {
  return {
    id: `gid://shopify/Order/${n}`,
    name: `#${1000 + n}`,
    createdAt: "2026-10-29T10:00:00Z",
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    tags: ["wholesale"],
    currentTotalPriceSet: {
      shopMoney: { amount: "125.50", currencyCode: "USD" },
    },
    lineItems: {
      nodes: [
        {
          title: "Tee",
          quantity: 2,
          variant: { id: "gid://shopify/ProductVariant/11" },
          product: { id: "gid://shopify/Product/1" },
        },
        {
          title: "Custom engraving",
          quantity: 1,
          variant: null,
          product: null,
        },
      ],
    },
  };
}

function ordersClient(total: number) {
  const graphql = vi.fn(
    async (_q: string, options?: { variables?: Record<string, unknown> }) => {
      const vars = options?.variables ?? {};
      const start = typeof vars.after === "string" ? Number(vars.after) : 0;
      const first = typeof vars.first === "number" ? vars.first : 25;
      const end = Math.min(start + first, total);
      const nodes = [];
      for (let n = start; n < end; n++) nodes.push(orderNode(n));
      return json({
        data: {
          orders: {
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

describe("getOrdersPage", () => {
  it("maps orders without any customer fields", async () => {
    const { client, graphql } = ordersClient(1);
    const page = await getOrdersPage(client, { search: "status:open" });

    expect(page.orders[0]).toEqual({
      id: "0",
      name: "#1000",
      createdAt: "2026-10-29T10:00:00Z",
      cancelledAt: null,
      totalAmount: 125.5,
      currencyCode: "USD",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      tags: ["wholesale"],
      lineItems: [
        { title: "Tee", quantity: 2, variantId: "11", productId: "1" },
        {
          title: "Custom engraving",
          quantity: 1,
          variantId: null,
          productId: null,
        },
      ],
    });
    const [query, options] = graphql.mock.calls[0];
    expect(options?.variables).toMatchObject({
      first: 25,
      query: "status:open",
    });
    // Privacy: the query never selects customer data.
    expect(query).not.toMatch(/customer|email|phone|Address|billing|shipping/i);
  });
});

describe("getRecentOrdersSample", () => {
  it("follows cursors across pages", async () => {
    const { client, graphql } = ordersClient(120);
    const { orders, capped } = await getRecentOrdersSample(client, 250);
    expect(orders).toHaveLength(120);
    expect(capped).toBe(false);
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("respects the cap", async () => {
    const { client } = ordersClient(1000);
    const { orders, capped } = await getRecentOrdersSample(client, 60);
    expect(orders).toHaveLength(60);
    expect(capped).toBe(true);
  });

  it("maps protected-customer-data denials to access_denied", async () => {
    const client: AdminGraphqlClient = {
      graphql: vi.fn(async () =>
        json({
          errors: [
            {
              message:
                "This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        }),
      ),
    };
    await expect(getRecentOrdersSample(client)).rejects.toMatchObject({
      kind: "access_denied",
    });
  });

  it("surfaces throttling after retries", async () => {
    const throttled = json({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    });
    const client: AdminGraphqlClient = {
      graphql: vi.fn(async () => throttled.clone()),
    };
    vi.useFakeTimers();
    const pending = getRecentOrdersSample(client).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await pending).toMatchObject({ kind: "throttled" });
  });
});

describe("getOrderCounts", () => {
  it("counts today (shop timezone) and unfulfilled without paging", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: { shop: { ianaTimezone: "Asia/Karachi" } } }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            today: { count: 3, precision: "EXACT" },
            unfulfilled: { count: 10000, precision: "AT_LEAST" },
          },
        }),
      );
    const counts = await getOrderCounts(
      { graphql },
      new Date("2026-10-30T12:00:00Z"),
    );

    expect(counts).toEqual({
      today: { count: 3, atLeast: false },
      unfulfilled: { count: 10000, atLeast: true },
    });
    expect(graphql.mock.calls[1][1]?.variables).toEqual({
      today: "created_at:>='2026-10-30T00:00:00+05:00'",
      unfulfilled: "status:open fulfillment_status:unfulfilled",
    });
  });
});
