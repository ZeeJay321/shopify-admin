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
