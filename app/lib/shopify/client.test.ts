import { describe, expect, it, vi } from "vitest";
import type { AdminGraphqlClient } from "./client";
import { assertNoUserErrors, refillWaitMs, runQuery } from "./client";
import { ShopifyApiError, toMerchantMessage } from "./errors";

type Step = Response | Error | (() => never);

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

/** Client that returns/throws each step in order. */
function fakeClient(...steps: Step[]) {
  const graphql = vi.fn(async () => {
    const step = steps.shift();
    if (!step) throw new Error("no more steps");
    if (step instanceof Response) return step;
    if (step instanceof Error) throw step;
    return step();
  });
  const client: AdminGraphqlClient = { graphql };
  return { client, graphql };
}

const cost = (requested: number, available: number, restoreRate = 100) => ({
  cost: {
    requestedQueryCost: requested,
    actualQueryCost: null,
    throttleStatus: {
      maximumAvailable: 2000,
      currentlyAvailable: available,
      restoreRate,
    },
  },
});

const throttledBody = {
  errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
  extensions: cost(500, 100),
};

async function expectKind(promise: Promise<unknown>, kind: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ShopifyApiError);
  expect((error as ShopifyApiError).kind).toBe(kind);
  return error as ShopifyApiError;
}

describe("runQuery", () => {
  it("returns data on success", async () => {
    const { client, graphql } = fakeClient(
      json({ data: { shop: { name: "ZJ" } }, extensions: cost(10, 1990) }),
    );
    const sleep = vi.fn(async () => {});
    const data = await runQuery<{ shop: { name: string } }>(
      client,
      "Shop",
      "query { shop { name } }",
      { a: 1 },
      { sleep },
    );
    expect(data.shop.name).toBe("ZJ");
    expect(graphql).toHaveBeenCalledWith("query { shop { name } }", {
      variables: { a: 1 },
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("maps GraphQL errors to a graphql error without leaking them to merchants", async () => {
    const { client } = fakeClient(
      json({ errors: [{ message: "Field 'nope' doesn't exist" }] }),
    );
    const error = await expectKind(runQuery(client, "Op", "q"), "graphql");
    expect(error.message).toContain("Field 'nope'");
    expect(toMerchantMessage(error).message).not.toContain("nope");
  });

  it("maps errors thrown by the Shopify library (GraphqlQueryError shape)", async () => {
    const thrown = Object.assign(new Error("GraphQL failed"), {
      body: {
        errors: {
          graphQLErrors: [
            {
              message: "Access denied for products field.",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        },
      },
    });
    const { client } = fakeClient(thrown);
    await expectKind(runQuery(client, "Op", "q"), "access_denied");
  });

  it("maps ACCESS_DENIED returned in the body", async () => {
    const { client } = fakeClient(
      json({
        data: null,
        errors: [{ message: "denied", extensions: { code: "ACCESS_DENIED" } }],
      }),
    );
    await expectKind(runQuery(client, "Op", "q"), "access_denied");
  });

  it("retries a throttled response after the bucket refill time", async () => {
    const { client, graphql } = fakeClient(
      json(throttledBody),
      json({ data: { ok: true } }),
    );
    const sleep = vi.fn(async () => {});
    const data = await runQuery<{ ok: boolean }>(client, "Op", "q", undefined, {
      sleep,
    });
    expect(data.ok).toBe(true);
    expect(graphql).toHaveBeenCalledTimes(2);
    // (500 requested - 100 available) / 100 per second = 4s
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it("retries throttling thrown by the library", async () => {
    const thrown = Object.assign(new Error("Throttled"), {
      body: {
        errors: { graphQLErrors: throttledBody.errors },
        extensions: throttledBody.extensions,
      },
    });
    const { client } = fakeClient(thrown, json({ data: { ok: true } }));
    const sleep = vi.fn(async () => {});
    await expect(
      runQuery(client, "Op", "q", undefined, { sleep }),
    ).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("gives up with a throttled error after max retries", async () => {
    const { client, graphql } = fakeClient(
      json(throttledBody),
      json(throttledBody),
      json(throttledBody),
    );
    const sleep = vi.fn(async () => {});
    await expectKind(
      runQuery(client, "Op", "q", undefined, { sleep, maxRetries: 2 }),
      "throttled",
    );
    expect(graphql).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries HTTP 429 using Retry-After", async () => {
    const { client } = fakeClient(
      new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      json({ data: { ok: true } }),
    );
    const sleep = vi.fn(async () => {});
    await runQuery(client, "Op", "q", undefined, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("backs off proactively when the bucket is nearly empty", async () => {
    const { client } = fakeClient(
      json({ data: { ok: true }, extensions: cost(300, 100, 50) }),
    );
    const sleep = vi.fn(async () => {});
    await runQuery(client, "Op", "q", undefined, { sleep });
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it("maps HTTP 5xx (returned or thrown) to an http error", async () => {
    await expectKind(
      runQuery(fakeClient(new Response("", { status: 502 })).client, "Op", "q"),
      "http",
    );
    const thrown = (() => {
      throw new Response("", { status: 503 });
    }) as () => never;
    await expectKind(runQuery(fakeClient(thrown).client, "Op", "q"), "http");
  });

  it("re-throws auth responses untouched so the template can re-authenticate", async () => {
    const reauth = new Response("", {
      status: 401,
      headers: { "X-Shopify-API-Request-Failure-Reauthorize": "1" },
    });
    const { client } = fakeClient(() => {
      throw reauth;
    });
    await expect(runQuery(client, "Op", "q")).rejects.toBe(reauth);
  });

  it("treats a response with no data as an error", async () => {
    await expectKind(
      runQuery(fakeClient(json({ data: null })).client, "Op", "q"),
      "graphql",
    );
  });

  it("maps unknown network failures to http without exposing details", async () => {
    const error = await expectKind(
      runQuery(fakeClient(new Error("ECONNRESET token=abc")).client, "Op", "q"),
      "http",
    );
    expect(error.message).not.toContain("token");
  });
});

describe("assertNoUserErrors", () => {
  it("passes on empty userErrors", () => {
    expect(() => assertNoUserErrors("Op", [])).not.toThrow();
    expect(() => assertNoUserErrors("Op", null)).not.toThrow();
  });

  it("throws a user_errors error with field paths", () => {
    try {
      assertNoUserErrors("productUpdate", [
        { field: ["input", "title"], message: "can't be blank" },
      ]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ShopifyApiError);
      expect((e as ShopifyApiError).kind).toBe("user_errors");
      expect((e as ShopifyApiError).message).toContain(
        "input.title: can't be blank",
      );
    }
  });
});

describe("refillWaitMs", () => {
  it("is 0 when the bucket has enough", () => {
    expect(
      refillWaitMs({
        requestedQueryCost: 10,
        throttleStatus: {
          maximumAvailable: 2000,
          currentlyAvailable: 50,
          restoreRate: 100,
        },
      }),
    ).toBe(0);
  });

  it("caps long waits", () => {
    expect(
      refillWaitMs({
        requestedQueryCost: 1000,
        throttleStatus: {
          maximumAvailable: 1000,
          currentlyAvailable: 0,
          restoreRate: 50,
        },
      }),
    ).toBe(5000);
  });
});
