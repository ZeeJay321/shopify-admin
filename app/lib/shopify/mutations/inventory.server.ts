/**
 * Stock adjustment (write_inventory) via `inventoryAdjustQuantities`
 * (2026-07). The docs recommend Adjust over Set unless the app is the
 * inventory system of record.
 *
 * - Compare-and-set: `changeFromQuantity` is mandatory since 2026-04; a
 *   mismatch returns CHANGE_FROM_QUANTITY_STALE -> "conflict".
 * - Idempotency: the `@idempotent(key:)` directive is required since
 *   2026-04. The key is generated once per confirmed action, so a retried or
 *   double-submitted confirmation runs once.
 * - Audit: reason "correction" plus a reference document URI identifying
 *   this app and the action.
 */

import { APP_REFERENCE_GID_PREFIX } from "../../config";
import type { InventoryAdjustStockMutation } from "../../../types/admin.generated";
import type { AdminGraphqlClient } from "../client";
import { runQuery } from "../client";
import { ShopifyApiError } from "../errors";
import { toGid } from "../gid";
import type { MutationResult, WriteError, WriteErrorCode } from "./types";

const INVENTORY_ADJUST = `#graphql
  mutation InventoryAdjustStock(
    $input: InventoryAdjustQuantitiesInput!
    $idempotencyKey: String!
  ) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        reason
        referenceDocumentUri
        changes { name delta quantityAfterChange }
      }
      userErrors { code field message }
    }
  }
`;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isActionKey(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function referenceDocumentUri(actionKey: string): string {
  return `${APP_REFERENCE_GID_PREFIX}/InventoryAdjustment/${actionKey}`;
}

export type AdjustInventoryInput = {
  inventoryItemId: string;
  locationId: string;
  /** The quantity the merchant saw (compare-and-set). */
  expectedQuantity: number;
  delta: number;
  /** UUID generated once per confirmed action (idempotency key). */
  actionKey: string;
};

export async function adjustInventory(
  client: AdminGraphqlClient,
  input: AdjustInventoryInput,
): Promise<MutationResult<{ quantityAfterChange: number | null }>> {
  const inventoryItemId = toGid("InventoryItem", input.inventoryItemId);
  const locationId = toGid("Location", input.locationId);
  if (!isActionKey(input.actionKey)) {
    throw new ShopifyApiError(
      "invalid_id",
      "Inventory adjustment",
      "bad action key",
    );
  }
  if (
    !Number.isSafeInteger(input.delta) ||
    !Number.isSafeInteger(input.expectedQuantity)
  ) {
    return {
      ok: false,
      error: { code: "validation", field: "quantity", detail: "non-integer" },
    };
  }

  const data = await runQuery<InventoryAdjustStockMutation>(
    client,
    "Adjust inventory",
    INVENTORY_ADJUST,
    {
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: referenceDocumentUri(input.actionKey),
        changes: [
          {
            inventoryItemId,
            locationId,
            delta: input.delta,
            changeFromQuantity: input.expectedQuantity,
          },
        ],
      },
      idempotencyKey: input.actionKey,
    },
    { maxRetries: 1 },
  );

  const payload = data.inventoryAdjustQuantities;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: mapInventoryUserError(userErrors) };
  }
  const change = payload?.inventoryAdjustmentGroup?.changes.find(
    (c) => c.name === "available",
  );
  return {
    ok: true,
    data: { quantityAfterChange: change?.quantityAfterChange ?? null },
  };
}

const CODE_MAP: Record<string, { code: WriteErrorCode; field?: string }> = {
  CHANGE_FROM_QUANTITY_STALE: { code: "conflict" },
  IDEMPOTENCY_CONCURRENT_REQUEST: { code: "conflict" },
  INVALID_QUANTITY_TOO_LOW: { code: "validation", field: "quantity" },
  INVALID_QUANTITY_TOO_HIGH: { code: "validation", field: "quantity" },
  ITEM_NOT_STOCKED_AT_LOCATION: { code: "not_found", field: "location" },
  INVALID_LOCATION: { code: "not_found", field: "location" },
  INVALID_INVENTORY_ITEM: { code: "not_found" },
  NON_MUTABLE_INVENTORY_ITEM: { code: "failed" },
  IDEMPOTENCY_KEY_PARAMETER_MISMATCH: { code: "failed" },
  IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED: { code: "failed" },
};

type InventoryUserError = {
  code?: string | null;
  field?: ReadonlyArray<string> | null;
  message: string;
};

export function mapInventoryUserError(
  userErrors: ReadonlyArray<InventoryUserError>,
): WriteError {
  const first = userErrors[0];
  const mapped = CODE_MAP[first.code ?? ""] ?? { code: "failed" as const };
  return {
    code: mapped.code,
    field: mapped.field,
    detail: userErrors.map((e) => `${e.code ?? "?"}: ${e.message}`).join("; "),
  };
}
