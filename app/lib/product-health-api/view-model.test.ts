import { describe, expect, it, vi } from "vitest";
import type { HealthSummaryResponse } from "./contract";
import {
  badgeTone,
  groupTone,
  healthSummaryUrl,
  loadHealthView,
  parseHealthResponse,
  reportHref,
} from "./view-model";

function summary(
  overrides: Partial<HealthSummaryResponse> = {},
): HealthSummaryResponse {
  return {
    ok: true,
    product: { id: "42", title: "Hoodie" },
    score: 72,
    scoreTone: "warning",
    issueCount: 2,
    groups: [
      { id: "content", label: "Content", status: "fail", issueCount: 1 },
      { id: "seo", label: "SEO", status: "warn", issueCount: 1 },
    ],
    topIssues: [
      {
        id: "description",
        label: "Description",
        status: "fail",
        message: "Product has no description.",
      },
    ],
    reportPath: "/app/products/42",
    ...overrides,
  };
}

const errorBody = (code: string) => ({
  ok: false,
  error: { code, title: "Title", message: "Message" },
});

describe("parseHealthResponse", () => {
  it("maps a summary with issues to ready", () => {
    expect(parseHealthResponse(200, summary())).toEqual({
      kind: "ready",
      summary: summary(),
    });
  });

  it("maps a summary without issues to healthy", () => {
    const body = summary({
      issueCount: 0,
      topIssues: [],
      score: 100,
      scoreTone: "success",
    });
    expect(parseHealthResponse(200, body).kind).toBe("healthy");
  });

  it("maps 401 to session_expired", () => {
    expect(parseHealthResponse(401, null)).toEqual({ kind: "session_expired" });
  });

  it.each(["invalid_id", "not_found"])("maps %s to unavailable", (code) => {
    expect(parseHealthResponse(404, errorBody(code))).toEqual({
      kind: "unavailable",
      message: "Message",
    });
  });

  it("maps throttled and upstream to retryable errors", () => {
    for (const code of ["throttled", "upstream"]) {
      expect(parseHealthResponse(429, errorBody(code))).toEqual({
        kind: "error",
        retryable: true,
        title: "Title",
        message: "Message",
      });
    }
  });

  it("maps access_denied to a non-retryable error", () => {
    expect(parseHealthResponse(403, errorBody("access_denied"))).toMatchObject({
      kind: "error",
      retryable: false,
    });
  });

  it.each([
    null,
    "oops",
    { ok: true },
    { ...summary(), scoreTone: "purple" },
    { ...summary(), groups: [{ id: "content" }] },
    { ok: false, error: { code: "weird", title: "t", message: "m" } },
  ])("treats malformed body %j as a retryable error", (body) => {
    expect(parseHealthResponse(200, body)).toEqual({
      kind: "error",
      retryable: true,
      title: null,
      message: null,
    });
  });
});

describe("loadHealthView", () => {
  it("fetches the numeric-id route for the product GID", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      json: async () => summary(),
    }));
    const state = await loadHealthView(fetchImpl, "gid://shopify/Product/42");
    expect(fetchImpl).toHaveBeenCalledWith("/api/product-health/42");
    expect(state.kind).toBe("ready");
  });

  it("is unavailable without a product GID and does not fetch", async () => {
    const fetchImpl = vi.fn();
    for (const gid of [null, undefined, "gid://shopify/Order/1"]) {
      expect(await loadHealthView(fetchImpl, gid)).toEqual({
        kind: "unavailable",
        message: null,
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps network failures and non-JSON bodies to retryable errors", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(
      await loadHealthView(offline, "gid://shopify/Product/1"),
    ).toMatchObject({
      kind: "error",
      retryable: true,
    });

    const html = vi.fn(async () => ({
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    expect(await loadHealthView(html, "gid://shopify/Product/1")).toMatchObject(
      {
        kind: "error",
        retryable: true,
      },
    );
  });
});

describe("formatting helpers", () => {
  it("maps group status to badge tone", () => {
    expect(groupTone("pass")).toBe("success");
    expect(groupTone("warn")).toBe("warning");
    expect(groupTone("fail")).toBe("critical");
  });

  it("passes score tones through", () => {
    expect(badgeTone("success")).toBe("success");
    expect(badgeTone("critical")).toBe("critical");
  });

  it("builds app: report links and API URLs", () => {
    expect(reportHref("/app/products/42")).toBe("app:app/products/42");
    expect(healthSummaryUrl("42")).toBe("/api/product-health/42");
  });
});
