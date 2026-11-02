/**
 * Sales channel (publication) reads for the Publishing check (phase 6).
 * Needs read_publications; without it Shopify denies access and this layer
 * raises an `access_denied` ShopifyApiError (callers fall back).
 *
 * 2026-07: Publication.name and Publication.app are deprecated, so the name
 * comes from catalog.title and Online Store is recognised by its app handle.
 */

import { PUBLICATIONS_CAP } from "../config";
import type { SalesChannel } from "../storefront-readiness/types";
import type {
  ProductsPublishedOnQuery,
  SalesChannelsQuery,
} from "../../types/admin.generated";
import type { AdminGraphqlClient } from "./client";
import { runQuery } from "./client";
import { numericIdFromGid, toProductGid } from "./gid";

const SALES_CHANNELS = `#graphql
  query SalesChannels($first: Int!) {
    publications(first: $first, catalogType: APP) {
      nodes {
        id
        catalog {
          title
          ... on AppCatalog {
            apps(first: 1) { nodes { handle } }
          }
        }
        includedProductsCount(limit: null) { count precision }
      }
    }
  }
`;

const PRODUCTS_PUBLISHED_ON = `#graphql
  query ProductsPublishedOn($ids: [ID!]!, $publicationId: ID!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        publishedOnPublication(publicationId: $publicationId)
      }
    }
  }
`;

const ONLINE_STORE_HANDLE = "online_store";
/** Shopify caps `nodes(ids:)` at 250 ids per request. */
const NODES_BATCH = 250;

export async function getSalesChannels(
  client: AdminGraphqlClient,
): Promise<SalesChannel[]> {
  const data = await runQuery<SalesChannelsQuery>(
    client,
    "Sales channels",
    SALES_CHANNELS,
    { first: PUBLICATIONS_CAP },
  );
  return data.publications.nodes.map((node) => {
    const name = node.catalog?.title?.trim() || "Unnamed channel";
    const handle =
      node.catalog && "apps" in node.catalog
        ? node.catalog.apps.nodes[0]?.handle
        : undefined;
    return {
      id: node.id,
      name,
      isOnlineStore:
        handle === ONLINE_STORE_HANDLE ||
        (handle === undefined && name === "Online Store"),
      productCount: node.includedProductsCount?.count ?? 0,
      atLeast: node.includedProductsCount?.precision === "AT_LEAST",
    };
  });
}

/**
 * Whether each product (numeric ids) is published to `publicationId`.
 * Products Shopify doesn't return (deleted) are left out.
 */
export async function getPublishedFlags(
  client: AdminGraphqlClient,
  productIds: readonly string[],
  publicationId: string,
): Promise<Map<string, boolean>> {
  const flags = new Map<string, boolean>();
  for (let i = 0; i < productIds.length; i += NODES_BATCH) {
    const ids = productIds.slice(i, i + NODES_BATCH).map(toProductGid);
    const data = await runQuery<ProductsPublishedOnQuery>(
      client,
      "Published products",
      PRODUCTS_PUBLISHED_ON,
      { ids, publicationId },
    );
    for (const node of data.nodes) {
      if (!node || !("publishedOnPublication" in node)) continue;
      const id = numericIdFromGid(node.id, "Product");
      if (id) flags.set(id, node.publishedOnPublication);
    }
  }
  return flags;
}
