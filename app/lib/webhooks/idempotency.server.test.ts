import { describe, expect, it } from "vitest";
import {
  claimWebhook,
  cleanupProcessedWebhooks,
  createCleanupScheduler,
  releaseWebhook,
} from "./idempotency.server";
import { createTestStore } from "./test-store";

const SHOP_A = "a.myshopify.com";
const SHOP_B = "b.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;

describe("claimWebhook", () => {
  it("claims a new delivery and reports the second one as a duplicate", async () => {
    const { store, rows } = createTestStore();
    const delivery = {
      shop: SHOP_A,
      webhookId: "wh-1",
      topic: "PRODUCTS_UPDATE",
    };

    expect(await claimWebhook(store, delivery)).toBe("claimed");
    expect(await claimWebhook(store, delivery)).toBe("duplicate");
    expect(rows).toHaveLength(1);
  });

  it("scopes the unique constraint to the shop", async () => {
    const { store } = createTestStore();
    expect(
      await claimWebhook(store, {
        shop: SHOP_A,
        webhookId: "wh-1",
        topic: "T",
      }),
    ).toBe("claimed");
    expect(
      await claimWebhook(store, {
        shop: SHOP_B,
        webhookId: "wh-1",
        topic: "T",
      }),
    ).toBe("claimed");
  });

  it("re-throws non-unique database errors", async () => {
    const boom = new Error("database is locked");
    const store = {
      create: async () => {
        throw boom;
      },
      deleteMany: async () => ({ count: 0 }),
    };
    await expect(
      claimWebhook(store, { shop: SHOP_A, webhookId: "x", topic: "T" }),
    ).rejects.toBe(boom);
  });

  it("allows a released delivery to be claimed again (retry after failure)", async () => {
    const { store } = createTestStore();
    const delivery = { shop: SHOP_A, webhookId: "wh-2", topic: "T" };
    await claimWebhook(store, delivery);
    await releaseWebhook(store, delivery);
    expect(await claimWebhook(store, delivery)).toBe("claimed");
  });
});

describe("cleanupProcessedWebhooks", () => {
  it("deletes only rows older than the retention window", async () => {
    let clock = new Date("2026-01-01T00:00:00Z");
    const { store, rows } = createTestStore(() => clock);
    await claimWebhook(store, { shop: SHOP_A, webhookId: "old", topic: "T" });
    clock = new Date(clock.getTime() + 20 * DAY);
    await claimWebhook(store, {
      shop: SHOP_A,
      webhookId: "recent",
      topic: "T",
    });

    const now = new Date(new Date("2026-01-01T00:00:00Z").getTime() + 31 * DAY);
    expect(await cleanupProcessedWebhooks(store, now, 30)).toBe(1);
    expect(rows.map((r) => r.webhookId)).toEqual(["recent"]);
  });
});

describe("createCleanupScheduler", () => {
  it("runs at most once per interval", async () => {
    let now = new Date("2026-01-01T00:00:00Z");
    const { store } = createTestStore();
    const maybeCleanup = createCleanupScheduler(store, {
      intervalMs: 60_000,
      now: () => now,
    });

    expect(await maybeCleanup()).toBe(0);
    expect(await maybeCleanup()).toBeNull();
    now = new Date(now.getTime() + 60_000);
    expect(await maybeCleanup()).toBe(0);
  });
});
