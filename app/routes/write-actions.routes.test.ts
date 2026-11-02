import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

import { action as productAction } from "./app.products.$id";
import { action as inventoryAction } from "./app.inventory";
import { action as readinessAction } from "./app.readiness";
import { action as productListAction } from "./app.products._index";

const SHOP = "zj-store.myshopify.com";

function args(
  method: string,
  fields: Record<string, string>,
): ActionFunctionArgs {
  const url = new URL("https://app.example/app/products/42");
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request(url, { method, body }),
    url,
    pattern: "/app/products/:id",
    params: { id: "42" },
    context: {},
  } as ActionFunctionArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  authenticateAdmin.mockResolvedValue({
    admin: { graphql: vi.fn() },
    session: { shop: SHOP, scope: "read_products" },
  });
});

describe.each([
  ["product", productAction, "update_seo"],
  ["inventory", inventoryAction, "adjust_inventory"],
  ["readiness", readinessAction, "apply_seo_batch"],
  ["readiness publish", readinessAction, "publish_products"],
  ["readiness edit", readinessAction, "update_content"],
  ["product edit", productAction, "update_content"],
  ["product list activate", productListAction, "activate_products"],
  ["product list SEO", productListAction, "apply_seo_batch"],
] as const)("%s route action", (_name, action, intent) => {
  it("is POST only", async () => {
    const response = await action(args("PUT", { intent }));
    expect(response.status).toBe(405);
    expect(authenticateAdmin).not.toHaveBeenCalled();
  });

  it("authenticates every request with authenticate.admin", async () => {
    await action(args("POST", { intent, confirm: "yes" }));
    expect(authenticateAdmin).toHaveBeenCalledTimes(1);
  });

  it("refuses writes when the session lacks the write scope", async () => {
    const response = await action(args("POST", { intent, confirm: "yes" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "permission_needed" });
  });

  it("propagates an unauthenticated response", async () => {
    authenticateAdmin.mockRejectedValue(new Response(null, { status: 401 }));
    await expect(action(args("POST", { intent }))).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("phase 6 fix intents", () => {
  const ALL = "write_products,write_inventory,write_publications";

  function withScopes(scope: string) {
    const graphql = vi.fn();
    authenticateAdmin.mockResolvedValue({
      admin: { graphql },
      session: { shop: SHOP, scope },
    });
    return graphql;
  }

  it("refuses publishing without write_publications even with write_products", async () => {
    const graphql = withScopes("write_products");
    const response = await readinessAction(
      args("POST", {
        intent: "publish_products",
        confirm: "yes",
        productId: "1",
        publicationId: "gid://shopify/Publication/2",
      }),
    );
    expect(response.status).toBe(403);
    expect(graphql).not.toHaveBeenCalled();
  });

  it.each([
    [
      readinessAction,
      {
        intent: "publish_products",
        productId: "1",
        publicationId: "gid://shopify/Publication/2",
      },
    ],
    [productListAction, { intent: "activate_products", productId: "1" }],
    [
      productAction,
      { intent: "update_content", productId: "42", title: "New" },
    ],
  ] as const)(
    "requires confirm=yes before calling Shopify",
    async (action, fields) => {
      const graphql = withScopes(ALL);
      const response = await action(args("POST", fields));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "confirmation_required",
      });
      expect(graphql).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid input without calling Shopify", async () => {
    const graphql = withScopes(ALL);
    const badIds = await productListAction(
      args("POST", {
        intent: "activate_products",
        confirm: "yes",
        productId: "gid://evil",
      }),
    );
    expect(badIds.status).toBe(400);
    const badChannel = await readinessAction(
      args("POST", {
        intent: "publish_products",
        confirm: "yes",
        productId: "1",
        publicationId: "online-store",
      }),
    );
    expect(badChannel.status).toBe(400);
    expect(graphql).not.toHaveBeenCalled();
  });

  it("takes the shop from the session, not the form", async () => {
    withScopes("read_products");
    const response = await readinessAction(
      args("POST", {
        intent: "publish_products",
        confirm: "yes",
        shop: "evil.myshopify.com",
      }),
    );
    expect(response.status).toBe(403);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining(`shop=${SHOP}`),
    );
  });
});
