import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

const { authenticateAdmin, loadHealthSummary } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  loadHealthSummary: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));
vi.mock("../lib/product-health-api/summary.server", () => ({
  loadHealthSummary,
}));

import { loader } from "./api.product-health.$id";

const admin = { graphql: vi.fn() };
const cors = vi.fn((response: Response) => {
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
});

function args(id: string): LoaderFunctionArgs {
  const url = new URL(`https://app.example/api/product-health/${id}`);
  return {
    request: new Request(url, {
      headers: { Authorization: "Bearer id-token" },
    }),
    url,
    pattern: "/api/product-health/:id",
    params: { id },
    context: {},
  } as LoaderFunctionArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdmin.mockResolvedValue({
    admin,
    cors,
    session: { shop: "zj-store.myshopify.com" },
  });
});

describe("GET /api/product-health/:id", () => {
  it("returns the summary with CORS and no-store", async () => {
    loadHealthSummary.mockResolvedValue({
      status: 200,
      body: { ok: true, score: 90 },
    });

    const response = await loader(args("42"));

    expect(loadHealthSummary).toHaveBeenCalledWith(admin, "42", {
      shop: "zj-store.myshopify.com",
      cache: expect.anything(),
    });
    expect(cors).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, score: 90 });
  });

  it("passes error status and headers through", async () => {
    loadHealthSummary.mockResolvedValue({
      status: 429,
      body: {
        ok: false,
        error: { code: "throttled", title: "t", message: "m" },
      },
      headers: { "Retry-After": "5" },
    });

    const response = await loader(args("42"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("lets an expired-session response from authenticate.admin propagate", async () => {
    const unauthorized = new Response(null, { status: 401 });
    authenticateAdmin.mockRejectedValue(unauthorized);

    await expect(loader(args("42"))).rejects.toBe(unauthorized);
    expect(loadHealthSummary).not.toHaveBeenCalled();
  });
});
