import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { appCache } from "../lib/cache/index.server";
import {
  createStorefrontNotifier,
  storefrontConfigFromEnv,
} from "../lib/storefront/revalidate.server";
import { createCleanupScheduler } from "../lib/webhooks/idempotency.server";
import { processWebhook } from "../lib/webhooks/process.server";

const notify = createStorefrontNotifier(storefrontConfigFromEnv());
const maybeCleanup = createCleanupScheduler(db.processedWebhook);

/**
 * products/create|update|delete and inventory_levels/update.
 * authenticate.webhook verifies the HMAC (401 on failure) and gives us the
 * shop and X-Shopify-Webhook-Id from verified headers.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, payload } =
    await authenticate.webhook(request);

  return processWebhook(
    {
      store: db.processedWebhook,
      cache: appCache,
      notifyStorefront: notify ? (event) => void notify(event) : undefined,
      maybeCleanup,
    },
    { shop, topic: String(topic), webhookId, payload },
  );
};
