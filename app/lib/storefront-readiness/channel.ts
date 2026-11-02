/**
 * Which sales channel the Publishing check uses (pure).
 *
 * 1. The channel named in the URL, if it exists.
 * 2. Online Store, if it has products.
 * 3. The other channel with the most products (ties: name, then id).
 * 4. Online Store (or nothing when the shop has no channels).
 */

import type { SalesChannel } from "./types";

export type ChannelChoice = {
  channel: SalesChannel | null;
  reason: "requested" | "online_store" | "most_products" | "fallback";
  /**
   * Online Store is empty while the chosen channel isn't: probably a
   * headless storefront, worth explaining to the merchant.
   */
  headlessHint: boolean;
};

export function chooseChannel(
  channels: readonly SalesChannel[],
  requestedId: string | null,
): ChannelChoice {
  const online = channels.find((c) => c.isOnlineStore) ?? null;
  const hint = (chosen: SalesChannel | null) =>
    online !== null &&
    online.productCount === 0 &&
    chosen !== null &&
    !chosen.isOnlineStore &&
    chosen.productCount > 0;

  const requested = requestedId
    ? channels.find((c) => c.id === requestedId)
    : undefined;
  if (requested) {
    return {
      channel: requested,
      reason: "requested",
      headlessHint: hint(requested),
    };
  }
  if (online && online.productCount > 0) {
    return { channel: online, reason: "online_store", headlessHint: false };
  }
  const best = channels
    .filter((c) => !c.isOnlineStore && c.productCount > 0)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )[0];
  if (best) {
    return { channel: best, reason: "most_products", headlessHint: hint(best) };
  }
  return { channel: online, reason: "fallback", headlessHint: false };
}
