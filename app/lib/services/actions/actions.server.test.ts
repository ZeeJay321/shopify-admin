import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteActionResult } from "../../actions";
import { MemoryTaggedCache } from "../../cache/memory-cache";
import { cacheKey, cacheTags } from "../../cache/types";
import type { AdminGraphqlClient } from "../../shopify/client";
import {
  inventoryActionHandlers,
  productActionHandlers,
  readinessActionHandlers,
} from "./index.server";
import type { AuthenticateAdmin } from "./run.server";
import { runWriteAction } from "./run.server";

const SHOP = "zj-store.myshopify.com";
const KEY = "3f5b6ebf-143c-4da5-8d0f-fb8553bfd85d";
const ALL_SCOPES =
  "read_products,write_products,read_inventory,write_inventory,read_locations,read_orders";

/** Product as returned by the ProductHealthDetail query. */
function productNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/42",
    title: "Organic Hoodie",
    handle: "organic-hoodie",
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

function fakeAdmin(respond: Responder) {
  const graphql = vi.fn(
    async (query: string, options?: { variables?: Record<string, unknown> }) =>
      new Response(JSON.stringify(respond(query, options?.variables ?? {}))),
  );
  const admin: AdminGraphqlClient = { graphql };
  return { admin, graphql };
}

const mutations = (graphql: ReturnType<typeof fakeAdmin>["graphql"]) =>
  graphql.mock.calls.filter(([q]) => /^\s*mutation /m.test(String(q)));

/** Standard Shopify behaviour for these tests. */
function storeResponder(product = productNode()): Responder {
  return (query, variables) => {
    if (query.includes("ProductHealthDetail")) return { data: { product } };
    if (query.includes("ProductUpdateSeo")) {
      const input = variables.product as {
        seo: { title: string; description: string };
      };
      return {
        data: {
          productUpdate: {
            product: { id: product.id, seo: input.seo },
            userErrors: [],
          },
        },
      };
    }
    if (query.includes("ProductUpdateStatus")) {
      const input = variables.product as { status: string };
      return {
        data: {
          productUpdate: {
            product: { id: product.id, status: input.status },
            userErrors: [],
          },
        },
      };
    }
    if (query.includes("InventoryAdjustStock")) {
      return {
        data: {
          inventoryAdjustQuantities: {
            inventoryAdjustmentGroup: {
              reason: "correction",
              referenceDocumentUri: "x",
              changes: [
                { name: "available", delta: 6, quantityAfterChange: 10 },
              ],
            },
            userErrors: [],
          },
        },
      };
    }
    throw new Error(`unexpected query ${query.slice(0, 60)}`);
  };
}

function post(
  fields: Record<string, string | string[]>,
  method = "POST",
): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) body.append(k, value);
  }
  return new Request("https://app.example/app/products/42", {
    method,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

function setup(respond: Responder = storeResponder(), scope = ALL_SCOPES) {
  const { admin, graphql } = fakeAdmin(respond);
  const authenticate = vi.fn<AuthenticateAdmin>(async () => ({
    admin,
    session: { shop: SHOP, scope },
  }));
  const cache = new MemoryTaggedCache();
  const invalidate = vi.spyOn(cache, "invalidateTags");
  return { admin, graphql, authenticate, cache, invalidate };
}

async function run(
  ctx: ReturnType<typeof setup>,
  request: Request,
  handlers = productActionHandlers,
) {
  const response = await runWriteAction(request, {
    authenticate: ctx.authenticate,
    cache: ctx.cache,
    handlers,
  });
  const body =
    response.status === 405
      ? null
      : ((await response.json()) as WriteActionResult);
  return { response, body };
}

const seoForm = (overrides: Record<string, string> = {}) => ({
  intent: "update_seo",
  productId: "42",
  title: "Organic Hoodie | ZJ",
  description:
    "Heavyweight organic cotton hoodie with a brushed fleece interior.",
  expectedTitle: "",
  expectedDescription: "",
  confirm: "yes",
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("runWriteAction guards", () => {
  it.each(["PUT", "PATCH", "DELETE"])(
    "returns 405 for %s without authenticating",
    async (method) => {
      const ctx = setup();
      const { response } = await run(ctx, post(seoForm(), method));
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(ctx.authenticate).not.toHaveBeenCalled();
    },
  );

  it("propagates the auth rejection for unauthenticated requests", async () => {
    const ctx = setup();
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "/auth/login" },
    });
    ctx.authenticate.mockRejectedValue(redirect);
    await expect(run(ctx, post(seoForm()))).rejects.toBe(redirect);
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("requires the explicit confirmation flag: no confirm, no mutation", async () => {
    const ctx = setup();
    const { response, body } = await run(ctx, post(seoForm({ confirm: "" })));
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: "confirmation_required" });
    expect(ctx.graphql).not.toHaveBeenCalled();
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it("refuses with permission_needed when the write scope isn't granted", async () => {
    const ctx = setup(storeResponder(), "read_products,read_inventory");
    const { response, body } = await run(ctx, post(seoForm()));
    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: "permission_needed" });
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("rejects unknown intents", async () => {
    const ctx = setup();
    const { response } = await run(
      ctx,
      post({ intent: "delete_everything", confirm: "yes" }),
    );
    expect(response.status).toBe(400);
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("takes the shop only from the session, ignoring a spoofed form field", async () => {
    const ctx = setup();
    const { body } = await run(
      ctx,
      post({ ...seoForm(), shop: "evil.myshopify.com" }),
    );
    expect(body?.ok).toBe(true);
    const tags = ctx.invalidate.mock.calls.flatMap(([t]) => t);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t.startsWith(`shop:${SHOP}:`))).toBe(true);
    expect(tags.some((t) => t.includes("evil"))).toBe(false);
  });

  it("logs only intent, shop, resource and outcome", async () => {
    const ctx = setup();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await run(ctx, post(seoForm()));
    const line = String(info.mock.calls.at(-1)?.[0]);
    expect(line).toBe(
      `[actions] update_seo shop=${SHOP} resource=42 outcome=200 ok`,
    );
    expect(line).not.toContain("Hoodie");
  });
});

describe("update_seo", () => {
  it("validates, mutates and invalidates product, dashboard, inventory and readiness tags", async () => {
    const ctx = setup();
    const productEntry = cacheKey<string>("product-health:42");
    ctx.cache.set(SHOP, productEntry, "stale", {
      tags: [cacheTags.product(SHOP, "42")],
    });

    const { response, body } = await run(ctx, post(seoForm()));

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      message: 'SEO updated for "Organic Hoodie".',
    });
    expect(mutations(ctx.graphql)).toHaveLength(1);
    expect(ctx.invalidate).toHaveBeenCalledWith([
      cacheTags.products(SHOP),
      cacheTags.inventory(SHOP),
      cacheTags.readiness(SHOP),
      cacheTags.product(SHOP, "42"),
    ]);
    expect(ctx.cache.get(SHOP, productEntry)).toBeUndefined();
  });

  it("returns validation errors without calling the mutation", async () => {
    const ctx = setup();
    const { response, body } = await run(
      ctx,
      post(seoForm({ title: "x".repeat(71) })),
    );
    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: "validation",
      fieldErrors: [{ field: "title" }],
    });
    expect(mutations(ctx.graphql)).toHaveLength(0);
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it("returns 409 with current values when SEO changed since the form loaded", async () => {
    const ctx = setup(
      storeResponder(
        productNode({ seo: { title: "Edited in Admin", description: null } }),
      ),
    );
    const { response, body } = await run(ctx, post(seoForm()));
    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "conflict",
      current: { title: "Edited in Admin", description: "" },
    });
    expect(mutations(ctx.graphql)).toHaveLength(0);
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it("maps a Shopify userError to a friendly field error and invalidates nothing", async () => {
    const respond = storeResponder();
    const ctx = setup((query, variables) =>
      query.includes("ProductUpdateSeo")
        ? {
            data: {
              productUpdate: {
                product: null,
                userErrors: [
                  {
                    field: ["product", "seo", "description"],
                    message: "raw shopify text",
                  },
                ],
              },
            },
          }
        : respond(query, variables),
    );
    const { response, body } = await run(ctx, post(seoForm()));
    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).not.toContain("raw shopify text");
    expect(body).toMatchObject({ fieldErrors: [{ field: "description" }] });
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it("maps a missing write permission from Shopify to permission_needed", async () => {
    const respond = storeResponder();
    const ctx = setup((query, variables) =>
      query.includes("ProductUpdateSeo")
        ? {
            errors: [
              {
                message: "Access denied",
                extensions: { code: "ACCESS_DENIED" },
              },
            ],
          }
        : respond(query, variables),
    );
    const { response, body } = await run(ctx, post(seoForm()));
    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: "permission_needed" });
  });

  it("rejects an invalid product id without calling Shopify", async () => {
    const ctx = setup();
    const { response } = await run(
      ctx,
      post(seoForm({ productId: "gid://shopify/Order/1" })),
    );
    expect(response.status).toBe(400);
    expect(ctx.graphql).not.toHaveBeenCalled();
  });
});

describe("set_status", () => {
  const statusForm = (overrides: Record<string, string> = {}) => ({
    intent: "set_status",
    productId: "42",
    status: "ACTIVE",
    expectedStatus: "DRAFT",
    confirm: "yes",
    ...overrides,
  });

  it("publishes a healthy draft", async () => {
    const ctx = setup();
    const { body } = await run(ctx, post(statusForm()));
    expect(body).toMatchObject({
      ok: true,
      message: '"Organic Hoodie" is now active.',
    });
    expect(mutations(ctx.graphql)).toHaveLength(1);
  });

  it("requires an acknowledgement to publish a product failing critical checks", async () => {
    const ctx = setup(
      storeResponder(productNode({ mediaCount: { count: 0 } })),
    );
    const first = await run(ctx, post(statusForm()));
    expect(first.response.status).toBe(400);
    expect(first.body).toMatchObject({ code: "acknowledgement_required" });
    expect(mutations(ctx.graphql)).toHaveLength(0);

    const second = await run(ctx, post(statusForm({ acknowledge: "yes" })));
    expect(second.body?.ok).toBe(true);
  });

  it("returns 409 when the status changed since the page loaded", async () => {
    const ctx = setup(storeResponder(productNode({ status: "ACTIVE" })));
    const { response, body } = await run(ctx, post(statusForm()));
    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "conflict",
      current: { status: "ACTIVE" },
    });
  });

  it("rejects archiving (not an allowed transition)", async () => {
    const ctx = setup();
    const { response } = await run(
      ctx,
      post(statusForm({ status: "ARCHIVED" })),
    );
    expect(response.status).toBe(422);
    expect(mutations(ctx.graphql)).toHaveLength(0);
  });
});

describe("adjust_inventory", () => {
  const stockForm = (overrides: Record<string, string> = {}) => ({
    intent: "adjust_inventory",
    productId: "42",
    inventoryItemId: "501",
    locationId: "7",
    expectedQuantity: "4",
    quantity: "10",
    actionKey: KEY,
    confirm: "yes",
    ...overrides,
  });

  it("adjusts stock and invalidates inventory, item, readiness and product tags", async () => {
    const ctx = setup();
    const { body } = await run(ctx, post(stockForm()), inventoryActionHandlers);
    expect(body).toMatchObject({ ok: true, message: "Stock updated: 4 → 10." });
    expect(ctx.invalidate).toHaveBeenCalledWith([
      cacheTags.inventory(SHOP),
      cacheTags.readiness(SHOP),
      cacheTags.inventoryItem(SHOP, "501"),
      cacheTags.product(SHOP, "42"),
    ]);
  });

  it("returns a conflict with the current quantity when stock changed", async () => {
    const ctx = setup((query) => {
      if (query.includes("InventoryAdjustStock")) {
        return {
          data: {
            inventoryAdjustQuantities: {
              inventoryAdjustmentGroup: null,
              userErrors: [
                {
                  code: "CHANGE_FROM_QUANTITY_STALE",
                  field: null,
                  message: "stale",
                },
              ],
            },
          },
        };
      }
      if (query.includes("InventoryLevelAvailable")) {
        return {
          data: {
            inventoryItem: {
              inventoryLevel: {
                quantities: [{ name: "available", quantity: 7 }],
              },
            },
          },
        };
      }
      throw new Error("unexpected");
    });
    const { response, body } = await run(
      ctx,
      post(stockForm()),
      inventoryActionHandlers,
    );
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: "conflict", current: { quantity: 7 } });
    expect(ctx.invalidate).not.toHaveBeenCalled();
  });

  it("validates before calling Shopify", async () => {
    const cases: Record<string, string>[] = [
      { quantity: "-1" },
      { quantity: "2.5" },
      { quantity: "5000" },
      { actionKey: "nope" },
      { inventoryItemId: "gid://shopify/Product/1" },
    ];
    for (const fields of cases) {
      const ctx = setup();
      const { response } = await run(
        ctx,
        post(stockForm(fields)),
        inventoryActionHandlers,
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(ctx.graphql).not.toHaveBeenCalled();
    }
  });

  it("requires an acknowledgement to set stock to 0", async () => {
    const ctx = setup();
    const { body } = await run(
      ctx,
      post(stockForm({ quantity: "0" })),
      inventoryActionHandlers,
    );
    expect(body).toMatchObject({ code: "acknowledgement_required" });
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("needs write_inventory specifically", async () => {
    const ctx = setup(
      storeResponder(),
      "read_products,write_products,read_inventory",
    );
    const { response } = await run(
      ctx,
      post(stockForm()),
      inventoryActionHandlers,
    );
    expect(response.status).toBe(403);
  });
});

describe("SEO batch", () => {
  it("previews suggestions without mutating", async () => {
    const ctx = setup();
    const { body } = await run(
      ctx,
      post({ intent: "preview_seo_batch", productId: ["42", "42"] }),
      readinessActionHandlers,
    );
    expect(body?.ok && body.preview?.length).toBe(1);
    expect(mutations(ctx.graphql)).toHaveLength(0);
  });

  it("applies per product and reports partial failures (not all-or-nothing)", async () => {
    const ctx = setup();
    const items = [
      {
        productId: "42",
        productTitle: "Organic Hoodie",
        title: "Organic Hoodie | ZJ",
        description:
          "Heavyweight organic cotton hoodie with a brushed fleece interior.",
        expectedTitle: "",
        expectedDescription: "",
      },
      {
        productId: "42",
        productTitle: "Stale copy",
        title: "Another",
        description:
          "Another description that is long enough to be accepted here.",
        expectedTitle: "Something else",
        expectedDescription: "",
      },
    ];
    const { body } = await run(
      ctx,
      post({
        intent: "apply_seo_batch",
        confirm: "yes",
        items: JSON.stringify(items),
      }),
      readinessActionHandlers,
    );
    expect(body).toMatchObject({
      ok: true,
      message: "Updated SEO for 1 of 2 products.",
    });
    expect(body?.ok && body.results?.map((r) => r.ok)).toEqual([true, false]);
  });

  it("rejects batches above the cap", async () => {
    const ctx = setup();
    const items = Array.from({ length: 11 }, () => ({
      productId: "42",
      title: "a",
      description: "b",
      expectedTitle: "",
      expectedDescription: "",
    }));
    const { response } = await run(
      ctx,
      post({
        intent: "apply_seo_batch",
        confirm: "yes",
        items: JSON.stringify(items),
      }),
      readinessActionHandlers,
    );
    expect(response.status).toBe(400);
    expect(ctx.graphql).not.toHaveBeenCalled();
  });

  it("recheck needs no write scope or confirmation", async () => {
    const ctx = setup(storeResponder(), "read_products");
    const { body } = await run(
      ctx,
      post({ intent: "recheck" }),
      readinessActionHandlers,
    );
    expect(body?.ok).toBe(true);
    expect(ctx.invalidate).toHaveBeenCalledWith([cacheTags.readiness(SHOP)]);
  });
});
