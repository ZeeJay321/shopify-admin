import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIGNATURE_HEADER,
  createStorefrontNotifier,
  signBody,
  storefrontConfigFromEnv,
} from "./revalidate.server";

const config = {
  url: "https://storefront.example/api/revalidate",
  secret: "s3cret",
};
const event = {
  topic: "products/update" as const,
  productId: "42",
  handle: "hoodie",
};
const now = () => new Date("2026-10-30T12:00:00.000Z");

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("storefrontConfigFromEnv", () => {
  it("requires both variables", () => {
    expect(storefrontConfigFromEnv({})).toBeNull();
    expect(
      storefrontConfigFromEnv({ STOREFRONT_REVALIDATE_URL: config.url }),
    ).toBeNull();
    expect(
      storefrontConfigFromEnv({
        STOREFRONT_REVALIDATE_URL: config.url,
        STOREFRONT_REVALIDATE_SECRET: config.secret,
      }),
    ).toEqual(config);
  });
});

describe("createStorefrontNotifier", () => {
  it("is disabled when not configured", () => {
    expect(createStorefrontNotifier(null)).toBeUndefined();
  });

  it("sends a signed POST with handle and topic only", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await createStorefrontNotifier(config, { fetchImpl, now })!(event);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = String(init.body);
    expect(url).toBe(config.url);
    expect(JSON.parse(body)).toEqual({
      topic: "products/update",
      productId: "42",
      handle: "hoodie",
      sentAt: "2026-10-30T12:00:00.000Z",
    });
    const expected = `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`;
    expect((init.headers as Record<string, string>)[SIGNATURE_HEADER]).toBe(
      expected,
    );
    expect(body).not.toContain(config.secret);
  });

  it("never throws when the storefront is down or errors", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      createStorefrontNotifier(config, { fetchImpl: down })!(event),
    ).resolves.toBeUndefined();

    const error = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(
      createStorefrontNotifier(config, { fetchImpl: error })!(event),
    ).resolves.toBeUndefined();
  });
});

describe("signBody", () => {
  it("is a hex HMAC-SHA256 with a sha256= prefix", () => {
    expect(signBody("{}", "k")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
