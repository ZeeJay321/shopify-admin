import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteActionResult } from "../../actions";
import { MemoryTaggedCache } from "../../cache/memory-cache";
import type { AdminGraphqlClient } from "../../shopify/client";
import { ShopifyApiError } from "../../shopify/errors";
import { runSequential } from "./bulk.server";
import {
  productActionHandlers,
  productListActionHandlers,
  readinessActionHandlers,
} from "./index.server";
import type { AuthenticateAdmin, IntentHandler } from "./run.server";
import { runWriteAction } from "./run.server";

const SHOP = "zj-store.myshopify.com";
const SCOPES = "write_products,write_publications";
const PUB = "gid://shopify/Publication/2";

function productNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Product ${id}`,
    handle: `p-${id}`,
    vendor: "ZJ",
    status: "DRAFT",
    description:
      "Heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.",
    onlineStoreUrl: null,
    seo: { title: null, description: null },
    options: [{ name: "Title", values: ["Default Title"] }],
    mediaCount: { count: 3 },
    featuredMedia: null,
    variantsCount: { count: 1 },
    collections: { nodes: [] },
    variants: {
      nodes: [
        {
          title: "Default Title",
          price: "25.00",
          inventoryQuantity: 4,
          inventoryItem: {
            id: "gid://shopify/InventoryItem/501",
            tracked: true,
          },
        },
      ],
    },
    ...overrides,
  };
}

type Responder = (query: string, variables: Record<string, unknown>) => unknown;

/** Products 1-3 exist; 2 is already on the channel; 3 has no image. */
const store =
  (
    overrides: Partial<Record<string, Record<string, unknown>>> = {},
  ): Responder =>
  (query, variables) => {
    if (query.includes("SalesChannels")) {
      return {
        data: {
          publications: {
            nodes: [
              {
                id: PUB,
                catalog: {
                  title: "Headless Storefront",
                  apps: { nodes: [{ handle: "headless" }] },
                },
                includedProductsCount: { count: 172, precision: "EXACT" },
              },
            ],
          },
        },
      };
    }
    if (query.includes("ProductsPublishedOn")) {
      const ids = variables.ids as string[];
      return {
        data: {
          nodes: ids.map((gid) =>
            gid.endsWith("/9")
              ? null
              : { id: gid, publishedOnPublication: gid.endsWith("/2") },
          ),
        },
      };
    }
    if (query.includes("PublishProduct")) {
      const failing = String(variables.id).endsWith("/3");
      return {
        data: {
          publishablePublish: {
            userErrors: failing
              ? [{ field: ["input"], message: "Publication is locked" }]
              : [],
          },
        },
      };
    }
    if (query.includes("ProductHealthDetail")) {
      const id = String(variables.id).split("/").pop() ?? "";
      if (id === "9") return { data: { product: null } };
      return { data: { product: productNode(id, overrides[id] ?? {}) } };
    }
    if (query.includes("ProductUpdateStatus")) {
      return {
        data: {
          productUpdate: {
            product: { id: variables.id, status: "ACTIVE" },
            userErrors: [],
          },
        },
      };
    }
    if (query.includes("ProductUpdateContent")) {
      return {
        data: {
          productUpdate: {
            product: { id: "x", title: "New title" },
            userErrors: [],
          },
        },
      };
    }
    throw new Error(`unexpected query ${query.slice(0, 60)}`);
  };

function setup(respond: Responder = store(), scope = SCOPES) {
  const graphql = vi.fn(
    async (query: string, options?: { variables?: Record<string, unknown> }) =>
      new Response(JSON.stringify(respond(query, options?.variables ?? {}))),
  );
  const admin: AdminGraphqlClient = { graphql };
  const authenticate = vi.fn<AuthenticateAdmin>(async () => ({
    admin,
    session: { shop: SHOP, scope },
  }));
  const cache = new MemoryTaggedCache();
  const invalidate = vi.spyOn(cache, "invalidateTags");
  return { graphql, authenticate, cache, invalidate };
}

function post(fields: Record<string, string | string[]>, method = "POST") {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) body.append(k, value);
  }
  return new Request("https://app.example/app/readiness", {
    method,
    body: method === "GET" ? undefined : body,
  });
}

async function call(
  ctx: ReturnType<typeof setup>,
  fields: Record<string, string | string[]>,
  handlers: Record<string, IntentHandler> = readinessActionHandlers,
  method = "POST",
) {
  const response = await runWriteAction(post(fields, method), {
    authenticate: ctx.authenticate,
    cache: ctx.cache,
    handlers,
  });
  const body =
    method === "POST" ? ((await response.json()) as WriteActionResult) : null;
  return { status: response.status, body };
}

const mutationCalls = (graphql: ReturnType<typeof setup>["graphql"]) =>
  graphql.mock.calls.filter(([q]) => /^\s*mutation /m.test(String(q)));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("publish_products", () => {
  const base = {
    intent: "publish_products",
    publicationId: PUB,
    confirm: "yes",
    productId: ["1", "2", "3", "9"],
    productTitle: ["One", "Two", "Three", "Gone"],
  };

  it("publishes per item: success, already published, user error, deleted", async () => {
    const ctx = setup();
    const { status, body } = await call(ctx, base);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      message: "2 of 4 updated; 2 need attention.",
    });
    expect(body?.ok && body.results).toEqual([
      {
        productId: "1",
        productTitle: "One",
        ok: true,
        message: "Published to Headless Storefront.",
      },
      {
        productId: "2",
        productTitle: "Two",
        ok: true,
        message: "Already published to Headless Storefront.",
      },
      {
        productId: "3",
        productTitle: "Three",
        ok: false,
        message: "Shopify didn't accept this change.",
      },
      {
        productId: "9",
        productTitle: "Gone",
        ok: false,
        message: "This product no longer exists.",
      },
    ]);
    // Only products 1 and 3 were actually sent to Shopify, in order.
    expect(mutationCalls(ctx.graphql).map(([, o]) => o?.variables?.id)).toEqual(
      ["gid://shopify/Product/1", "gid://shopify/Product/3"],
    );
    expect(ctx.invalidate).toHaveBeenCalledWith(
      expect.arrayContaining([
        `shop:${SHOP}:product:1`,
        `shop:${SHOP}:readiness`,
      ]),
    );
    expect(ctx.invalidate).toHaveBeenCalledWith([
      `shop:${SHOP}:publications`,
      `shop:${SHOP}:readiness`,
    ]);
  });

  it("rejects more than 25 products before calling Shopify", async () => {
    const ctx = setup();
    const ids = Array.from({ length: 26 }, (_, i) => String(i + 1));
    const { status, body } = await call(ctx, {
      ...base,
      productId: ids,
      productTitle: ids,
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "validation" });
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("requires confirm=yes, a valid channel id and write_publications", async () => {
    const noConfirm = setup();
    expect(
      (await call(noConfirm, { ...base, confirm: "" })).body,
    ).toMatchObject({ code: "confirmation_required" });
    expect(noConfirm.graphql).not.toHaveBeenCalled();

    const badId = setup();
    expect(
      (await call(badId, { ...base, publicationId: "gid://shopify/Product/1" }))
        .status,
    ).toBe(400);
    expect(badId.graphql).not.toHaveBeenCalled();

    const noScope = setup(store(), "write_products");
    expect((await call(noScope, base)).status).toBe(403);
    expect(noScope.graphql).not.toHaveBeenCalled();
  });

  it("returns not_found for a channel Shopify doesn't list", async () => {
    const ctx = setup();
    const { status } = await call(ctx, {
      ...base,
      publicationId: "gid://shopify/Publication/999",
    });
    expect(status).toBe(404);
    expect(mutationCalls(ctx.graphql)).toHaveLength(0);
  });

  it("is POST only and uses the session shop", async () => {
    const ctx = setup();
    expect((await call(ctx, base, readinessActionHandlers, "GET")).status).toBe(
      405,
    );
    expect(ctx.authenticate).not.toHaveBeenCalled();
    await call(ctx, { ...base, shop: "evil.myshopify.com" });
    expect(
      ctx.invalidate.mock.calls
        .flat(2)
        .every((t) => String(t).startsWith(`shop:${SHOP}:`)),
    ).toBe(true);
  });
});

describe("activate_products", () => {
  it("activates healthy drafts and skips ones with critical issues", async () => {
    const ctx = setup(
      store({ "3": { mediaCount: { count: 0 } }, "2": { status: "ACTIVE" } }),
    );
    const { body } = await call(
      ctx,
      {
        intent: "activate_products",
        confirm: "yes",
        productId: ["1", "2", "3"],
        productTitle: ["A", "B", "C"],
      },
      productListActionHandlers,
    );
    expect(
      body?.ok && body.results?.map((r) => [r.productId, r.ok, r.message]),
    ).toEqual([
      ["1", true, "Now active."],
      ["2", false, "This product is already active."],
      [
        "3",
        false,
        "Skipped: it has critical issues. Open it to review and publish.",
      ],
    ]);
    expect(mutationCalls(ctx.graphql)).toHaveLength(1);
  });
});

describe("update_content", () => {
  const fields = {
    intent: "update_content",
    confirm: "yes",
    productId: "1",
    title: "New title",
    description:
      "Heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.",
    expectedTitle: "Product 1",
    expectedDescription:
      "Heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.",
  };

  it("sends only the changed title (description formatting is kept)", async () => {
    const ctx = setup();
    const { status } = await call(ctx, fields, productActionHandlers);
    expect(status).toBe(200);
    const [[, options]] = mutationCalls(ctx.graphql);
    expect(options?.variables).toEqual({
      product: { id: "gid://shopify/Product/1", title: "New title" },
    });
  });

  it("sends a changed description as escaped HTML", async () => {
    const ctx = setup();
    await call(
      ctx,
      {
        ...fields,
        title: "Product 1",
        description: "Soft <b>cotton</b>\n\nWarm",
      },
      productActionHandlers,
    );
    const [[, options]] = mutationCalls(ctx.graphql);
    expect(options?.variables).toEqual({
      product: {
        id: "gid://shopify/Product/1",
        descriptionHtml: "<p>Soft &lt;b&gt;cotton&lt;/b&gt;</p><p>Warm</p>",
      },
    });
  });

  it("returns 409 when the product changed since the dialog opened", async () => {
    const ctx = setup();
    const { status, body } = await call(
      ctx,
      { ...fields, expectedTitle: "Old" },
      productActionHandlers,
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({
      code: "conflict",
      current: { title: "Product 1" },
    });
    expect(mutationCalls(ctx.graphql)).toHaveLength(0);
  });

  it("re-validates on the server without calling the mutation", async () => {
    const ctx = setup();
    const { status, body } = await call(
      ctx,
      { ...fields, title: "Untitled" },
      productActionHandlers,
    );
    expect(status).toBe(422);
    expect(body).toMatchObject({ code: "validation" });
    expect(mutationCalls(ctx.graphql)).toHaveLength(0);
  });
});

describe("runSequential", () => {
  const items = [1, 2, 3].map((n) => ({
    productId: `${n}`,
    productTitle: `P${n}`,
  }));

  it("runs in order and returns every result", async () => {
    const order: string[] = [];
    const results = await runSequential(items, async (item) => {
      order.push(item.productId);
      return { ok: true, message: "ok" };
    });
    expect(order).toEqual(["1", "2", "3"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("stops after throttling and marks the rest not attempted", async () => {
    const run = vi.fn(async (item: { productId: string }) => {
      if (item.productId === "2")
        throw new ShopifyApiError("throttled", "x", "busy");
      return { ok: true, message: "ok" };
    });
    const results = await runSequential(items, run);
    expect(results.map((r) => [r.ok, r.message])).toEqual([
      [true, "ok"],
      [false, "Shopify was busy. Try this one again."],
      [false, "Not attempted. Try again in a moment."],
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("continues past per-item failures and rethrows non-Shopify errors", async () => {
    const results = await runSequential(items, async (item) => {
      if (item.productId === "1")
        throw new ShopifyApiError("not_found", "x", "y");
      return { ok: true, message: "ok" };
    });
    expect(results.map((r) => r.ok)).toEqual([false, true, true]);
    await expect(
      runSequential(items, async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});
