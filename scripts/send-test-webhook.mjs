#!/usr/bin/env node
/**
 * Local webhook tester: sends a correctly HMAC-signed webhook to the app,
 * optionally several times with the SAME X-Shopify-Webhook-Id, to verify
 * duplicate deliveries are ignored. Dev only; never point this at production.
 *
 *   SHOPIFY_API_SECRET=... node scripts/send-test-webhook.mjs \
 *     --url http://localhost:<port>/webhooks/app/catalog \
 *     --shop your-dev-store.myshopify.com \
 *     --topic products/update --product-id 123 --times 2
 *
 * Flags: --topic products/create|products/update|products/delete|inventory_levels/update
 *        --webhook-id <id> (default: random)  --times <n> (default 1)
 *        --inventory-item-id <id>  --bad-signature (expect 401)
 */

import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    shop: { type: "string" },
    topic: { type: "string", default: "products/update" },
    "webhook-id": { type: "string" },
    "product-id": { type: "string", default: "1" },
    "inventory-item-id": { type: "string", default: "1" },
    times: { type: "string", default: "1" },
    "bad-signature": { type: "boolean", default: false },
  },
});

const secret = process.env.SHOPIFY_API_SECRET;
if (!values.url || !values.shop || !secret) {
  console.error(
    "Usage: SHOPIFY_API_SECRET=... node scripts/send-test-webhook.mjs --url <app webhook url> --shop <shop.myshopify.com> [--topic ...] [--times 2]",
  );
  process.exit(1);
}

const payload = values.topic.startsWith("inventory_levels/")
  ? {
      inventory_item_id: Number(values["inventory-item-id"]),
      location_id: 1,
      available: 0,
      admin_graphql_api_id: `gid://shopify/InventoryLevel/1?inventory_item_id=${values["inventory-item-id"]}`,
    }
  : {
      id: Number(values["product-id"]),
      admin_graphql_api_id: `gid://shopify/Product/${values["product-id"]}`,
      handle: "test-product",
    };

const body = JSON.stringify(payload);
const hmac = createHmac("sha256", values["bad-signature"] ? "wrong" : secret)
  .update(body)
  .digest("base64");
const webhookId = values["webhook-id"] ?? randomUUID();

for (let i = 1; i <= Number(values.times); i++) {
  const response = await fetch(values.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Topic": values.topic,
      "X-Shopify-Shop-Domain": values.shop,
      "X-Shopify-API-Version": "2026-07",
      "X-Shopify-Webhook-Id": webhookId,
      "X-Shopify-Triggered-At": new Date().toISOString(),
    },
    body,
  });
  console.log(
    `#${i} ${values.topic} webhook-id=${webhookId} -> HTTP ${response.status}`,
  );
}
