/**
 * Collection reads for Storefront Readiness (covered by read_products).
 */

import { COLLECTIONS_CAP } from "../config";
import type { ReadinessCollection } from "../storefront-readiness/types";
import type { ReadinessCollectionsQuery } from "../../types/admin.generated";
import type { AdminGraphqlClient } from "./client";
import { runQuery } from "./client";
import { numericIdFromGid } from "./gid";
import { collectPages } from "./pagination";

const READINESS_COLLECTIONS = `#graphql
  query ReadinessCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        productsCount { count }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function getCollections(
  client: AdminGraphqlClient,
  cap: number = COLLECTIONS_CAP,
): Promise<{ collections: ReadinessCollection[]; capped: boolean }> {
  const { nodes, capped } = await collectPages(
    async (cursor, pageSize) => {
      const data = await runQuery<ReadinessCollectionsQuery>(
        client,
        "Collections",
        READINESS_COLLECTIONS,
        { first: pageSize, after: cursor },
      );
      return {
        nodes: data.collections.nodes,
        pageInfo: {
          hasNextPage: data.collections.pageInfo.hasNextPage,
          endCursor: data.collections.pageInfo.endCursor ?? null,
        },
      };
    },
    { cap, pageSize: 50 },
  );
  const collections = nodes.flatMap((n) => {
    const id = numericIdFromGid(n.id, "Collection");
    return id
      ? [
          {
            id,
            title: n.title,
            handle: n.handle,
            productCount: n.productsCount?.count ?? 0,
          },
        ]
      : [];
  });
  return { collections, capped };
}
