/**
 * Maps Admin GraphQL product nodes to the plain `ProductSnapshot` used by the
 * scoring library, plus a few display fields for the UI.
 */

import type { ProductHealthListQuery } from "../../types/admin.generated";
import type { ProductSnapshot } from "../product-health/types";
import { numericIdFromGid } from "./gid";

export type ProductNode = ProductHealthListQuery["products"]["nodes"][number];

/** The extra sales channel scoring accepts (see `scoringChannel`). */
export type ScoringChannel = { id: string; name: string };

export type ProductRecord = {
  snapshot: ProductSnapshot;
  handle: string;
  vendor: string;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Numeric inventory item ids of the fetched variants (for cache tags). */
  inventoryItemIds: string[];
  /** Whether the product belongs to at least one collection. */
  inAnyCollection: boolean;
};

export function toProductRecord(
  node: ProductNode,
  channel: ScoringChannel | null = null,
): ProductRecord {
  const variants = node.variants.nodes.map((v) => ({
    title: v.title,
    price: parsePrice(v.price),
    inventoryQuantity:
      typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null,
    tracked: v.inventoryItem.tracked,
  }));

  const image = node.featuredMedia?.preview?.image ?? null;

  return {
    snapshot: {
      id: node.id,
      title: node.title,
      status: node.status,
      description: node.description,
      imageCount: node.mediaCount?.count ?? 0,
      seoTitle: node.seo.title ?? null,
      seoDescription: node.seo.description ?? null,
      options: node.options.map((o) => ({ name: o.name, values: o.values })),
      variants,
      variantCount: node.variantsCount?.count ?? variants.length,
      publishedToOnlineStore: toStringOrNull(node.onlineStoreUrl) !== null,
      // Only set when known, so channel-less snapshots are unchanged.
      ...(channel && typeof node.publishedOnPublication === "boolean"
        ? {
            salesChannel: {
              name: channel.name,
              published: node.publishedOnPublication,
            },
          }
        : {}),
    },
    handle: node.handle,
    vendor: node.vendor,
    imageUrl: toStringOrNull(image?.url),
    imageAlt: image?.altText ?? null,
    inventoryItemIds: node.variants.nodes
      .map((v) => numericIdFromGid(v.inventoryItem.id, "InventoryItem"))
      .filter((id): id is string => id !== null),
    inAnyCollection: node.collections.nodes.length > 0,
  };
}

/** Shopify Money scalars arrive as decimal strings, e.g. "19.99". */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
