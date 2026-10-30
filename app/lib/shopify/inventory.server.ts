/**
 * Inventory reads for the Inventory Risk page (read_inventory, read_locations).
 * Read-only; uses the throttle-aware client and cursor pagination.
 */

import {
  INVENTORY_LEVELS_LIMIT,
  INVENTORY_PAGE_SIZE,
  INVENTORY_SAMPLE_CAP,
  LOCATIONS_CAP,
} from "../config";
import type { VariantInventory } from "../inventory-risk/types";
import type {
  InventoryLocationsQuery,
  InventoryVariantsQuery,
} from "../../types/admin.generated";
import type { AdminGraphqlClient } from "./client";
import { runQuery } from "./client";
import { numericIdFromGid } from "./gid";
import { collectPages } from "./pagination";

// --- Locations --------------------------------------------------------------

const INVENTORY_LOCATIONS = `#graphql
  query InventoryLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after, sortKey: NAME) {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export type InventoryLocation = { id: string; name: string };

export async function getLocations(
  client: AdminGraphqlClient,
  cap: number = LOCATIONS_CAP,
): Promise<{ locations: InventoryLocation[]; capped: boolean }> {
  const { nodes, capped } = await collectPages(
    async (cursor, pageSize) => {
      const data = await runQuery<InventoryLocationsQuery>(
        client,
        "Locations",
        INVENTORY_LOCATIONS,
        { first: pageSize, after: cursor },
      );
      return {
        nodes: data.locations.nodes,
        pageInfo: {
          hasNextPage: data.locations.pageInfo.hasNextPage,
          endCursor: data.locations.pageInfo.endCursor ?? null,
        },
      };
    },
    { cap, pageSize: 50 },
  );
  const locations = nodes.flatMap((n) => {
    const id = numericIdFromGid(n.id, "Location");
    return id ? [{ id, name: n.name }] : [];
  });
  return { locations, capped };
}

// --- Variants with inventory levels ------------------------------------------

const INVENTORY_VARIANTS = `#graphql
  query InventoryVariants(
    $first: Int
    $after: String
    $last: Int
    $before: String
    $query: String
    $levelsFirst: Int!
  ) {
    productVariants(
      first: $first
      after: $after
      last: $last
      before: $before
      query: $query
      sortKey: INVENTORY_QUANTITY
    ) {
      nodes {
        id
        title
        product { id title }
        inventoryItem {
          id
          tracked
          inventoryLevels(first: $levelsFirst) {
            nodes {
              location { id name }
              quantities(names: ["available"]) { name quantity }
            }
          }
        }
      }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }
`;

export type InventoryPageRequest = {
  cursor?: string | null;
  direction?: "next" | "prev";
  /** Numeric location id; restricts to variants stocked there. */
  locationId?: string | null;
  pageSize?: number;
};

export type InventoryPage = {
  variants: VariantInventory[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

/** Archived products are excluded: they can't sell, so they aren't a risk. */
export function inventorySearchQuery(locationId?: string | null): string {
  const base = "product_status:active,draft";
  return locationId ? `${base} location_id:${locationId}` : base;
}

export async function getInventoryPage(
  client: AdminGraphqlClient,
  {
    cursor = null,
    direction = "next",
    locationId = null,
    pageSize = INVENTORY_PAGE_SIZE,
  }: InventoryPageRequest = {},
): Promise<InventoryPage> {
  const paging =
    direction === "prev" && cursor
      ? { last: pageSize, before: cursor }
      : { first: pageSize, after: cursor };

  const data = await runQuery<InventoryVariantsQuery>(
    client,
    "Inventory",
    INVENTORY_VARIANTS,
    {
      ...paging,
      query: inventorySearchQuery(locationId),
      levelsFirst: INVENTORY_LEVELS_LIMIT,
    },
  );

  const { pageInfo } = data.productVariants;
  return {
    variants: data.productVariants.nodes.flatMap(toVariantInventory),
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      hasPreviousPage: pageInfo.hasPreviousPage,
      startCursor: pageInfo.startCursor ?? null,
      endCursor: pageInfo.endCursor ?? null,
    },
  };
}

/** Bounded scan for the summary cards; never walks the whole catalog. */
export async function getInventorySample(
  client: AdminGraphqlClient,
  cap: number = INVENTORY_SAMPLE_CAP,
): Promise<{ variants: VariantInventory[]; capped: boolean }> {
  const { nodes, capped } = await collectPages(
    async (cursor, pageSize) => {
      const page = await getInventoryPage(client, { cursor, pageSize });
      return { nodes: page.variants, pageInfo: page.pageInfo };
    },
    { cap, pageSize: INVENTORY_PAGE_SIZE },
  );
  return { variants: nodes, capped };
}

type VariantNode = InventoryVariantsQuery["productVariants"]["nodes"][number];

export function toVariantInventory(node: VariantNode): VariantInventory[] {
  const variantId = numericIdFromGid(node.id, "ProductVariant");
  const productId = numericIdFromGid(node.product.id, "Product");
  if (!variantId || !productId) return [];

  return [
    {
      variantId,
      variantTitle: node.title,
      productId,
      productTitle: node.product.title,
      tracked: node.inventoryItem.tracked,
      levels: node.inventoryItem.inventoryLevels.nodes.flatMap((level) => {
        const locationId = numericIdFromGid(level.location.id, "Location");
        if (!locationId) return [];
        const available =
          level.quantities.find((q) => q.name === "available")?.quantity ?? 0;
        return [{ locationId, locationName: level.location.name, available }];
      }),
    },
  ];
}
