import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

const { authenticateAdmin } = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
}));
vi.mock("../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
}));

import { loader as apiLoader } from "./api.product-health.$id";
import { loader as detailLoader } from "./app.products.$id";
import { appCache } from "../lib/cache/index.server";
import { productHealthKey } from "../lib/cache/keys";
import { resolveScoringChannel } from "../lib/services/sales-channels.server";

const HEADLESS = "gid://shopify/Publication/2";

/** A healthy product that is only on the headless channel (CSV import case). */
function productNode(onHeadless: boolean, withChannel: boolean) {
  return {
    id: "gid://shopify/Product/42",
    title: "Organic Hoodie",
    handle: "organic-hoodie",
    vendor: "ZJ",
    status: "ACTIVE",
    description:
      "Heavyweight organic cotton hoodie with a brushed fleece interior and ribbed cuffs.",
    onlineStoreUrl: null,
    ...(withChannel ? { publishedOnPublication: onHeadless } : {}),
    seo: {
      title: "Organic Hoodie | ZJ",
      description:
        "Warm organic cotton hoodie with a brushed fleece interior, ribbed cuffs and a relaxed fit.",
    },
    options: [{ name: "Title", values: ["Default Title"] }],
    mediaCount: { count: 3 },
    featuredMedia: null,
    variantsCount: { count: 1 },
    collections: { nodes: [{ id: "gid://shopify/Collection/1" }] },
    variants: {
      nodes: [
        {
          title: "Default Title",
          price: "25.00",
          inventoryQuantity: 40,
          inventoryItem: {
            id: "gid://shopify/InventoryItem/501",
            tracked: true,
          },
        },
      ],
    },
  };
}

function shopify({ scope = true, onHeadless = true } = {}) {
  return vi.fn(
    async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => {
      const vars = options?.variables ?? {};
      let body: unknown;
      if (query.includes("SalesChannels")) {
        body = scope
          ? {
              data: {
                publications: {
                  nodes: [
                    {
                      id: "gid://shopify/Publication/1",
                      catalog: {
                        title: "Online Store",
                        apps: { nodes: [{ handle: "online_store" }] },
                      },
                      includedProductsCount: { count: 0, precision: "EXACT" },
                    },
                    {
                      id: HEADLESS,
                      catalog: {
                        title: "Headless Storefront",
                        apps: { nodes: [{ handle: "headless" }] },
                      },
                      includedProductsCount: { count: 172, precision: "EXACT" },
                    },
                  ],
                },
              },
            }
          : {
              errors: [
                {
                  message: "Access denied for publications field.",
                  extensions: { code: "ACCESS_DENIED" },
                },
              ],
            };
      } else if (query.includes("ProductHealthDetail")) {
        body = {
          data: {
            product: productNode(
              onHeadless,
              vars.withChannel === true && vars.publicationId === HEADLESS,
            ),
          },
        };
      } else {
        throw new Error(`unexpected query ${query.slice(0, 50)}`);
      }
      return new Response(JSON.stringify(body));
    },
  );
}

let shopCounter = 0;
function signIn(graphql: ReturnType<typeof shopify>) {
  // A fresh shop per test keeps the shared app cache isolated.
  const shop = `scoring-${++shopCounter}.myshopify.com`;
  authenticateAdmin.mockResolvedValue({
    admin: { graphql },
    cors: (response: Response) => response,
    session: { shop, scope: "read_products,read_publications" },
  });
  return shop;
}

function args(path: string): LoaderFunctionArgs {
  const url = new URL(`https://app.example${path}`);
  return {
    request: new Request(url),
    url,
    pattern: path,
    params: { id: "42" },
    context: {},
  } as LoaderFunctionArgs;
}

async function scores() {
  const api = (await (
    await apiLoader(args("/api/product-health/42"))
  ).json()) as { score: number };
  const detail = await detailLoader(args("/app/products/42"));
  return { api: api.score, detail: detail.health?.score, detailData: detail };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Product Health scoring channel", () => {
  it("scores a headless-only product as published, the same in the extension API and the detail page", async () => {
    signIn(shopify());
    const { api, detail, detailData } = await scores();
    expect(api).toBe(100);
    expect(detail).toBe(api);
    expect(
      detailData.health?.checks.find((c) => c.id === "online_store"),
    ).toMatchObject({
      status: "pass",
      message: "Published to Headless Storefront.",
    });
    expect(detailData.scoring).toEqual({
      channel: { id: HEADLESS, name: "Headless Storefront" },
      scopeMissing: false,
    });
  });

  it("fails the check off the channel, still matching across both", async () => {
    signIn(shopify({ onHeadless: false }));
    const { api, detail, detailData } = await scores();
    expect(api).toBe(95);
    expect(detail).toBe(api);
    expect(
      detailData.health?.checks.find((c) => c.id === "online_store")?.message,
    ).toBe("Not published to Headless Storefront or the Online Store.");
  });

  it("falls back to Online Store only without read_publications", async () => {
    signIn(shopify({ scope: false }));
    const { api, detail, detailData } = await scores();
    expect(api).toBe(95);
    expect(detail).toBe(api);
    expect(detailData.scoring).toEqual({ channel: null, scopeMissing: true });
  });

  it("caches the extension summary per channel", async () => {
    const shop = signIn(shopify());
    await apiLoader(args("/api/product-health/42"));
    expect(appCache.get(shop, productHealthKey("42", HEADLESS))).toBeDefined();
    expect(appCache.get(shop, productHealthKey("42"))).toBeUndefined();
  });
});

describe("resolveScoringChannel", () => {
  it("propagates throttling instead of silently changing scores", async () => {
    const graphql = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [
              { message: "Throttled", extensions: { code: "THROTTLED" } },
            ],
          }),
        ),
    );
    vi.useFakeTimers();
    const pending = resolveScoringChannel(
      { graphql },
      "t.myshopify.com",
      appCache,
    ).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await pending).toMatchObject({ kind: "throttled" });
  });
});
