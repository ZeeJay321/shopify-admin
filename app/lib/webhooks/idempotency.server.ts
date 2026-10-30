/**
 * Webhook idempotency: "claim first, release on failure".
 *
 * 1. claim: atomically INSERT (shop, webhookId). The unique constraint makes
 *    a second delivery of the same id fail with P2002 -> it's a duplicate.
 * 2. run the handler.
 * 3. on handler failure: release (DELETE the row) and return 500, so
 *    Shopify's retry of the same webhook id is processed normally.
 *
 * Old rows are deleted by `cleanupProcessedWebhooks`.
 */

import { Prisma } from "@prisma/client";
import {
  PROCESSED_WEBHOOK_RETENTION_DAYS,
  WEBHOOK_CLEANUP_INTERVAL_MS,
} from "../config";

export type WebhookDeliveryKey = {
  shop: string;
  webhookId: string;
};

/** The slice of `prisma.processedWebhook` this module uses. */
export type ProcessedWebhookStore = {
  create(args: {
    data: { shop: string; webhookId: string; topic: string };
  }): Promise<unknown>;
  deleteMany(args: {
    where: { shop: string; webhookId: string } | { receivedAt: { lt: Date } };
  }): Promise<{ count: number }>;
};

export type ClaimResult = "claimed" | "duplicate";

export async function claimWebhook(
  store: ProcessedWebhookStore,
  delivery: WebhookDeliveryKey & { topic: string },
): Promise<ClaimResult> {
  try {
    await store.create({
      data: {
        shop: delivery.shop,
        webhookId: delivery.webhookId,
        topic: delivery.topic,
      },
    });
    return "claimed";
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

export async function releaseWebhook(
  store: ProcessedWebhookStore,
  delivery: WebhookDeliveryKey,
): Promise<void> {
  await store.deleteMany({
    where: { shop: delivery.shop, webhookId: delivery.webhookId },
  });
}

export async function cleanupProcessedWebhooks(
  store: ProcessedWebhookStore,
  now: Date = new Date(),
  retentionDays: number = PROCESSED_WEBHOOK_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await store.deleteMany({
    where: { receivedAt: { lt: cutoff } },
  });
  return count;
}

/**
 * Opportunistic cleanup: call after each processed webhook; it only touches
 * the database once per interval per server instance.
 */
export function createCleanupScheduler(
  store: ProcessedWebhookStore,
  {
    intervalMs = WEBHOOK_CLEANUP_INTERVAL_MS,
    now = () => new Date(),
  }: { intervalMs?: number; now?: () => Date } = {},
): () => Promise<number | null> {
  let lastRunAt = -Infinity;
  return async () => {
    const current = now();
    if (current.getTime() - lastRunAt < intervalMs) return null;
    lastRunAt = current.getTime();
    return cleanupProcessedWebhooks(store, current);
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
