import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";
import { createTestStore } from "../lib/webhooks/test-store";

const { authenticateWebhook, testStore } = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  testStore: { current: null as ReturnType<typeof createTestStore> | null },
}));

vi.mock("../shopify.server", () => ({
  authenticate: { webhook: authenticateWebhook },
}));

vi.mock("../db.server", () => ({
  default: {
    processedWebhook: {
      create: (
        args: Parameters<
          ReturnType<typeof createTestStore>["store"]["create"]
        >[0],
      ) => testStore.current!.store.create(args),
      deleteMany: (
        args: Parameters<
          ReturnType<typeof createTestStore>["store"]["deleteMany"]
        >[0],
      ) => testStore.current!.store.deleteMany(args),
    },
  },
}));

import { action } from "./webhooks.app.catalog";

const SHOP = "zj.myshopify.com";

function args(): ActionFunctionArgs {
  const url = new URL("https://app.example/webhooks/app/catalog");
  return {
    request: new Request(url, { method: "POST", body: "{}" }),
    url,
    pattern: "/webhooks/app/catalog",
    params: {},
    context: {},
  } as ActionFunctionArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  testStore.current = createTestStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /webhooks/app/catalog", () => {
  it("processes a verified delivery", async () => {
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "PRODUCTS_UPDATE",
      webhookId: "wh-1",
      payload: { id: 1 },
    });

    const response = await action(args());

    expect(response.status).toBe(200);
    expect(testStore.current!.rows).toHaveLength(1);
  });

  it("rejects an invalid HMAC signature before any processing", async () => {
    authenticateWebhook.mockRejectedValue(
      new Response(undefined, { status: 401 }),
    );

    await expect(action(args())).rejects.toMatchObject({ status: 401 });
    expect(testStore.current!.rows).toHaveLength(0);
  });

  it("ignores a duplicate delivery", async () => {
    authenticateWebhook.mockResolvedValue({
      shop: SHOP,
      topic: "INVENTORY_LEVELS_UPDATE",
      webhookId: "wh-dup",
      payload: { inventory_item_id: 5 },
    });

    expect((await action(args())).status).toBe(200);
    expect((await action(args())).status).toBe(200);
    expect(testStore.current!.rows).toHaveLength(1);
  });

  describe.each(["ORDERS_CREATE", "ORDERS_UPDATED"])("%s", (topic) => {
    it("is processed once and a duplicate is ignored", async () => {
      authenticateWebhook.mockResolvedValue({
        shop: SHOP,
        topic,
        webhookId: `order-${topic}`,
        payload: { id: 820982911946154500 },
      });

      expect((await action(args())).status).toBe(200);
      expect((await action(args())).status).toBe(200);
      expect(testStore.current!.rows).toEqual([
        expect.objectContaining({ webhookId: `order-${topic}`, topic }),
      ]);
    });

    it("is rejected on an invalid signature", async () => {
      authenticateWebhook.mockRejectedValue(
        new Response(undefined, { status: 401 }),
      );
      await expect(action(args())).rejects.toMatchObject({ status: 401 });
      expect(testStore.current!.rows).toHaveLength(0);
    });
  });
});
