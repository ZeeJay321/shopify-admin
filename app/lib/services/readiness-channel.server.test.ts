import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTaggedCache } from "../cache/memory-cache";
import { perfectProduct } from "../product-health/test-fixtures";
import type { AdminGraphqlClient } from "../shopify/client";
import { ShopifyApiError } from "../shopify/errors";
import type { ProductRecord } from "../shopify/snapshot";
import { webhookHandlers } from "../webhooks/handlers";

const mocks = vi.hoisted(() => ({
  getProductSample: vi.fn(),
  getCollections: vi.fn(),
  getSalesChannels: vi.fn(),
  getPublishedFlags: vi.fn(),
}));
vi.mock("../shopify/products.server", () => ({
  getProductSample: mocks.getProductSample,
}));
vi.mock("../shopify/collections.server", () => ({
  getCollections: mocks.getCollections,
}));
vi.mock("../shopify/publications.server", () => ({
  getSalesChannels: mocks.getSalesChannels,
  getPublishedFlags: mocks.getPublishedFlags,
}));

import { loadReadiness, loadReadinessView } from "./readiness.server";

const client: AdminGraphqlClient = { graphql: vi.fn() };
const SHOP = "a.myshopify.com";

/** 30 live products, none on Online Store (CSV import), all on Headless. */
const records: ProductRecord[] = Array.from({ length: 30 }, (_, i) => ({
  snapshot: perfectProduct({
    id: `gid://shopify/Product/${i + 1}`,
    title: `Product ${i + 1}`,
    publishedToOnlineStore: false,
  }),
  handle: `p-${i + 1}`,
  vendor: "ZJ",
  imageUrl: null,
  imageAlt: null,
  inventoryItemIds: [],
  inAnyCollection: true,
}));

const ONLINE = {
  id: "gid://shopify/Publication/1",
  name: "Online Store",
  isOnlineStore: true,
  productCount: 0,
  atLeast: false,
};
const HEADLESS = {
  id: "gid://shopify/Publication/2",
  name: "Headless Storefront",
  isOnlineStore: false,
  productCount: 30,
  atLeast: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.getProductSample.mockResolvedValue({
    products: records,
    capped: false,
  });
  mocks.getCollections.mockResolvedValue({
    collections: [{ id: "1", title: "All", handle: "all", productCount: 30 }],
    capped: false,
  });
  mocks.getSalesChannels.mockResolvedValue([ONLINE, HEADLESS]);
  mocks.getPublishedFlags.mockImplementation(
    async (_c: unknown, ids: string[], publicationId: string) =>
      new Map(ids.map((id) => [id, publicationId === HEADLESS.id])),
  );
});

const publishing = (report: { checks: Array<{ id: string }> }) =>
  report.checks.find((c) => c.id === "online_store");

describe("loadReadinessView", () => {
  it("defaults to the headless channel and passes the publishing check", async () => {
    const view = await loadReadinessView(
      client,
      SHOP,
      new MemoryTaggedCache(),
      null,
    );
    expect(view.choice).toMatchObject({
      reason: "most_products",
      headlessHint: true,
    });
    expect(publishing(view.report)).toMatchObject({
      name: "Published to Headless Storefront",
      status: "pass",
      affectedCount: 0,
    });
  });

  it("checks the requested channel, with every affected product (no cap)", async () => {
    const view = await loadReadinessView(
      client,
      SHOP,
      new MemoryTaggedCache(),
      ONLINE.id,
    );
    const check = publishing(view.report);
    expect(check).toMatchObject({
      name: "Published to Online Store",
      affectedCount: 30,
    });
    expect(
      view.report.checks.find((c) => c.id === "online_store")
        ?.affectedResources,
    ).toHaveLength(30);
    expect(
      view.report.checks.find((c) => c.id === "online_store")
        ?.affectedResources[0],
    ).toMatchObject({ id: "1", problem: "Not published to Online Store" });
    expect(view.report.productIndex?.["1"]).toMatchObject({
      title: "Product 1",
      vendor: "ZJ",
    });
  });

  it("caches per channel", async () => {
    const cache = new MemoryTaggedCache();
    await loadReadinessView(client, SHOP, cache, HEADLESS.id);
    await loadReadinessView(client, SHOP, cache, HEADLESS.id);
    await loadReadinessView(client, SHOP, cache, ONLINE.id);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(2);
    expect(mocks.getSalesChannels).toHaveBeenCalledTimes(1);
  });

  it("is invalidated by product_publications webhooks", async () => {
    const cache = new MemoryTaggedCache();
    await loadReadinessView(client, SHOP, cache, null);
    await webhookHandlers.PRODUCT_PUBLICATIONS_UPDATE({
      shop: SHOP,
      payload: { product_id: 1 },
      cache,
    });
    await loadReadinessView(client, SHOP, cache, null);
    expect(mocks.getProductSample).toHaveBeenCalledTimes(2);
    expect(mocks.getSalesChannels).toHaveBeenCalledTimes(2);
  });

  it("falls back to Online Store by URL without read_publications", async () => {
    mocks.getSalesChannels.mockRejectedValue(
      new ShopifyApiError(
        "access_denied",
        "Sales channels",
        "read_publications",
      ),
    );
    const view = await loadReadinessView(
      client,
      SHOP,
      new MemoryTaggedCache(),
      HEADLESS.id,
    );
    expect(view.channels).toBeNull();
    expect(view.choice).toBeNull();
    expect(publishing(view.report)).toMatchObject({
      name: "Published to the Online Store",
      affectedCount: 30,
    });
    expect(mocks.getPublishedFlags).not.toHaveBeenCalled();
  });

  it("propagates other channel errors", async () => {
    mocks.getSalesChannels.mockRejectedValue(
      new ShopifyApiError("throttled", "x", "y"),
    );
    await expect(
      loadReadinessView(client, SHOP, new MemoryTaggedCache(), null),
    ).rejects.toMatchObject({ kind: "throttled" });
  });

  it("marks the check not applicable when flags are missing", async () => {
    mocks.getPublishedFlags.mockResolvedValue(new Map());
    const report = await loadReadiness(
      client,
      SHOP,
      new MemoryTaggedCache(),
      undefined,
      {
        channel: { id: HEADLESS.id, name: HEADLESS.name },
      },
    );
    expect(publishing(report)).toMatchObject({ status: "not_applicable" });
  });
});
