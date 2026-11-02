/**
 * Product reads for Store Health / Product Health. Read-only (read_products).
 * All Admin GraphQL for products lives here; routes never build queries.
 */

import {
  DETAIL_VARIANTS_LIMIT,
  HEALTH_SAMPLE_CAP,
  LIST_VARIANTS_LIMIT,
  PRODUCTS_PAGE_SIZE,
} from "../config";
import type {
  ProductHealthDetailQuery,
  ProductHealthListQuery,
  ProductsMatchingCountQuery,
  StoreProductCountsQuery,
} from "../../types/admin.generated";
import { joinQuery } from "./search";
import type { AdminGraphqlClient } from "./client";
import { runQuery } from "./client";
import { ShopifyApiError } from "./errors";
import { collectPages } from "./pagination";
import type { ProductStatusFilter } from "./product-status";
import type { ProductRecord, ScoringChannel } from "./snapshot";
import { toProductRecord } from "./snapshot";

// --- Counts -----------------------------------------------------------------

const STORE_PRODUCT_COUNTS = `#graphql
  query StoreProductCounts {
    all: productsCount(limit: null) { count precision }
    active: productsCount(query: "status:active", limit: null) { count precision }
    draft: productsCount(query: "status:draft", limit: null) { count precision }
    archived: productsCount(query: "status:archived", limit: null) { count precision }
  }
`;

export type ProductCount = {
  count: number;
  /** True when Shopify reports a lower bound rather than an exact count. */
  atLeast: boolean;
};

export type StoreCounts = Record<
  "all" | "active" | "draft" | "archived",
  ProductCount
>;

export async function getStoreCounts(
  client: AdminGraphqlClient,
): Promise<StoreCounts> {
  const data = await runQuery<StoreProductCountsQuery>(
    client,
    "Product counts",
    STORE_PRODUCT_COUNTS,
  );
  const toCount = (c: StoreProductCountsQuery["all"]): ProductCount => ({
    count: c?.count ?? 0,
    atLeast: c?.precision === "AT_LEAST",
  });
  return {
    all: toCount(data.all),
    active: toCount(data.active),
    draft: toCount(data.draft),
    archived: toCount(data.archived),
  };
}

// --- List -------------------------------------------------------------------

const PRODUCT_HEALTH_LIST = `#graphql
  query ProductHealthList(
    $first: Int
    $after: String
    $last: Int
    $before: String
    $query: String
    $variantsFirst: Int!
    $sortKey: ProductSortKeys = TITLE
    $reverse: Boolean = false
    $publicationId: ID! = "gid://shopify/Publication/0"
    $withChannel: Boolean = false
  ) {
    products(
      first: $first
      after: $after
      last: $last
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      nodes {
        id
        title
        handle
        vendor
        status
        description
        onlineStoreUrl
      publishedOnPublication(publicationId: $publicationId)
        @include(if: $withChannel)
        publishedOnPublication(publicationId: $publicationId)
          @include(if: $withChannel)
        seo { title description }
        options { name values }
        mediaCount { count }
        featuredMedia { preview { image { url altText } } }
        variantsCount { count }
        collections(first: 1) { nodes { id } }
        variants(first: $variantsFirst) {
          nodes {
            title
            price
            inventoryQuantity
            inventoryItem { id tracked }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }
`;

export type ProductsPageRequest = {
  /** Cursor to page from; null for the first page. */
  cursor?: string | null;
  direction?: "next" | "prev";
  status?: ProductStatusFilter | null;
  /** Extra Shopify search (e.g. from `productTitleSearch`). */
  search?: string | null;
  sort?: { key: ProductSortKey; reverse: boolean };
  pageSize?: number;
  /** Also read "published to this channel" for scoring (read_publications). */
  channel?: ScoringChannel | null;
};

/** Query variables that add the channel flag (skipped without a channel). */
function channelVariables(channel: ScoringChannel | null | undefined) {
  return channel ? { publicationId: channel.id, withChannel: true } : {};
}

export type ProductSortKey = "TITLE" | "UPDATED_AT";

const PRODUCTS_MATCHING_COUNT = `#graphql
  query ProductsMatchingCount($query: String) {
    productsCount(query: $query, limit: null) { count precision }
  }
`;

/** Shopify search for the product list (status filter plus search). */
export function productListQuery(
  status: ProductStatusFilter | null,
  search: string | null,
): string | null {
  return joinQuery(status ? `status:${status.toLowerCase()}` : null, search);
}

/** Count for "Showing 21-40 of N" (same query as the list). */
export async function getProductsCount(
  client: AdminGraphqlClient,
  query: string | null,
): Promise<ProductCount> {
  const data = await runQuery<ProductsMatchingCountQuery>(
    client,
    "Product count",
    PRODUCTS_MATCHING_COUNT,
    { query },
  );
  return {
    count: data.productsCount?.count ?? 0,
    atLeast: data.productsCount?.precision === "AT_LEAST",
  };
}

export type ProductsPage = {
  products: ProductRecord[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

export async function getProductsPage(
  client: AdminGraphqlClient,
  {
    cursor = null,
    direction = "next",
    status = null,
    search = null,
    sort = { key: "TITLE", reverse: false },
    pageSize = PRODUCTS_PAGE_SIZE,
    channel = null,
  }: ProductsPageRequest = {},
): Promise<ProductsPage> {
  const paging =
    direction === "prev" && cursor
      ? { last: pageSize, before: cursor }
      : { first: pageSize, after: cursor };

  const data = await runQuery<ProductHealthListQuery>(
    client,
    "Product list",
    PRODUCT_HEALTH_LIST,
    {
      ...paging,
      query: productListQuery(status, search),
      variantsFirst: LIST_VARIANTS_LIMIT,
      sortKey: sort.key,
      reverse: sort.reverse,
      ...channelVariables(channel),
    },
  );

  return {
    products: data.products.nodes.map((node) => toProductRecord(node, channel)),
    pageInfo: {
      hasNextPage: data.products.pageInfo.hasNextPage,
      hasPreviousPage: data.products.pageInfo.hasPreviousPage,
      startCursor: data.products.pageInfo.startCursor ?? null,
      endCursor: data.products.pageInfo.endCursor ?? null,
    },
  };
}

/** Bounded sample for the dashboard; never walks the whole catalog. */
export async function getProductSample(
  client: AdminGraphqlClient,
  cap: number = HEALTH_SAMPLE_CAP,
  channel: ScoringChannel | null = null,
): Promise<{ products: ProductRecord[]; capped: boolean }> {
  const { nodes, capped } = await collectPages(
    async (cursor, pageSize) => {
      const page = await getProductsPage(client, { cursor, pageSize, channel });
      return { nodes: page.products, pageInfo: page.pageInfo };
    },
    { cap, pageSize: PRODUCTS_PAGE_SIZE },
  );
  return { products: nodes, capped };
}

// --- Detail -----------------------------------------------------------------

const PRODUCT_HEALTH_DETAIL = `#graphql
  query ProductHealthDetail(
    $id: ID!
    $variantsFirst: Int!
    $publicationId: ID! = "gid://shopify/Publication/0"
    $withChannel: Boolean = false
  ) {
    product(id: $id) {
      id
      title
      handle
      vendor
      status
      description
      onlineStoreUrl
      seo { title description }
      options { name values }
      mediaCount { count }
      featuredMedia { preview { image { url altText } } }
      variantsCount { count }
      collections(first: 1) { nodes { id } }
      variants(first: $variantsFirst) {
        nodes {
          title
          price
          inventoryQuantity
          inventoryItem { id tracked }
        }
      }
    }
  }
`;

/** `id` must be a Product GID (see `toProductGid`). */
export async function getProduct(
  client: AdminGraphqlClient,
  id: string,
  channel: ScoringChannel | null = null,
): Promise<ProductRecord> {
  const data = await runQuery<ProductHealthDetailQuery>(
    client,
    "Product detail",
    PRODUCT_HEALTH_DETAIL,
    { id, variantsFirst: DETAIL_VARIANTS_LIMIT, ...channelVariables(channel) },
  );
  if (!data.product) {
    throw new ShopifyApiError("not_found", "Product detail", "no product");
  }
  return toProductRecord(data.product, channel);
}
