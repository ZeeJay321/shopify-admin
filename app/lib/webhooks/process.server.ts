/**
 * Webhook dispatcher: idempotency + handler registry. HMAC verification
 * happens before this, in the route, via `authenticate.webhook`.
 */

import type { TaggedCache } from "../cache/types";
import type { StorefrontEvent, WebhookHandler } from "./handlers";
import { handlerFor } from "./handlers";
import type { ProcessedWebhookStore } from "./idempotency.server";
import { claimWebhook, releaseWebhook } from "./idempotency.server";

export type WebhookDelivery = {
  shop: string;
  topic: string;
  webhookId: string;
  payload: unknown;
};

export type ProcessWebhookDeps = {
  store: ProcessedWebhookStore;
  cache: TaggedCache;
  notifyStorefront?: (event: StorefrontEvent) => void;
  /** Opportunistic cleanup of old processed ids; failures are only logged. */
  maybeCleanup?: () => Promise<unknown>;
  /** Override the registry (tests). */
  resolveHandler?: (topic: string) => WebhookHandler | undefined;
};

export async function processWebhook(
  deps: ProcessWebhookDeps,
  delivery: WebhookDelivery,
): Promise<Response> {
  const { shop, topic, webhookId } = delivery;
  const label = `${topic} ${webhookId} for ${shop}`;

  const handler = (deps.resolveHandler ?? handlerFor)(topic);
  if (!handler) {
    console.info(`[webhooks] Unsupported topic ${label}; acknowledged.`);
    return new Response();
  }

  if (!webhookId) {
    // Shopify always sends X-Shopify-Webhook-Id; without it we can't dedupe,
    // but invalidation is idempotent, so processing is still safe.
    console.warn(`[webhooks] Missing webhook id for ${topic} (${shop}).`);
  } else if (
    (await claimWebhook(deps.store, { shop, webhookId, topic })) === "duplicate"
  ) {
    console.info(`[webhooks] Duplicate ${label}; ignored.`);
    return new Response();
  }

  try {
    await handler({
      shop,
      payload: delivery.payload,
      cache: deps.cache,
      notifyStorefront: deps.notifyStorefront,
    });
  } catch (error) {
    console.error(
      `[webhooks] Handler failed for ${label}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    if (webhookId) {
      await releaseWebhook(deps.store, { shop, webhookId }).catch(() => {
        console.error(`[webhooks] Could not release ${label}.`);
      });
    }
    return new Response("Webhook processing failed", { status: 500 });
  }

  deps.maybeCleanup?.().catch(() => {
    console.warn("[webhooks] Processed-webhook cleanup failed.");
  });
  return new Response();
}
