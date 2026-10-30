/**
 * Optional storefront sync hook. When STOREFRONT_REVALIDATE_URL and
 * STOREFRONT_REVALIDATE_SECRET are both set, product webhooks send a small
 * signed POST so the headless storefront can refresh its catalog cache.
 *
 * Body: {"topic":"products/update","productId":"123","handle":"tee","sentAt":"<ISO>"}
 * Header: X-ZJ-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed by the secret>
 *
 * Fire-and-forget: failures are logged (without the secret) and never affect
 * the Shopify webhook response.
 */

import { createHmac } from "node:crypto";
import type { StorefrontEvent } from "../webhooks/handlers";

export const SIGNATURE_HEADER = "X-ZJ-Signature";
const TIMEOUT_MS = 3_000;

export type StorefrontConfig = { url: string; secret: string };

export function storefrontConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): StorefrontConfig | null {
  const url = env.STOREFRONT_REVALIDATE_URL?.trim();
  const secret = env.STOREFRONT_REVALIDATE_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Returns undefined when not configured, so callers can skip it entirely. */
export function createStorefrontNotifier(
  config: StorefrontConfig | null,
  {
    fetchImpl = fetch,
    now = () => new Date(),
  }: { fetchImpl?: FetchLike; now?: () => Date } = {},
): ((event: StorefrontEvent) => Promise<void>) | undefined {
  if (!config) return undefined;

  return async (event) => {
    const body = JSON.stringify({
      topic: event.topic,
      productId: event.productId,
      handle: event.handle,
      sentAt: now().toISOString(),
    });
    try {
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNATURE_HEADER]: signBody(body, config.secret),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        console.warn(
          `[storefront] Revalidate returned HTTP ${response.status}.`,
        );
      }
    } catch {
      console.warn("[storefront] Revalidate request failed.");
    }
  };
}
