/**
 * Stock adjustment action. Compare-and-set is done by Shopify
 * (`changeFromQuantity`): if stock changed since the dialog opened, Shopify
 * rejects the change and we return 409 with the current quantity.
 */

import { parseIntegerInput, planInventoryAdjustment } from "../../actions";
import { cacheTags } from "../../cache/types";
import { numericIdFromGid, toGid } from "../../shopify/gid";
import { getAvailableQuantity } from "../../shopify/inventory.server";
import {
  adjustInventory,
  isActionKey,
} from "../../shopify/mutations/inventory.server";
import { inventoryInvalidationTags } from "../../webhooks/handlers";
import { fromWriteError } from "./product.server";
import type { IntentHandler } from "./run.server";
import { failure, success } from "./run.server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export const adjustInventoryHandler: IntentHandler = {
  scope: "write_inventory",
  requiresConfirmation: true,
  async run(ctx) {
    const itemGid = toGid("InventoryItem", text(ctx.form, "inventoryItemId"));
    const locationGid = toGid("Location", text(ctx.form, "locationId"));
    const itemId = numericIdFromGid(itemGid, "InventoryItem") ?? "";
    const productId = numericIdFromGid(
      toGid("Product", text(ctx.form, "productId")),
      "Product",
    );
    const actionKey = text(ctx.form, "actionKey");
    if (!isActionKey(actionKey)) {
      return failure(
        ctx.intent,
        400,
        "validation",
        {
          fieldErrors: [
            { field: "form", message: "Reopen the dialog and try again." },
          ],
        },
        itemId,
      );
    }

    const expected = parseIntegerInput(text(ctx.form, "expectedQuantity"));
    if (expected === null) {
      return failure(
        ctx.intent,
        400,
        "validation",
        {
          fieldErrors: [
            { field: "form", message: "Reload the page and try again." },
          ],
        },
        itemId,
      );
    }
    const plan = planInventoryAdjustment({
      expected,
      next: parseIntegerInput(text(ctx.form, "quantity")),
    });
    if (!plan.valid) {
      return failure(
        ctx.intent,
        422,
        "validation",
        { fieldErrors: plan.errors },
        itemId,
      );
    }
    if (
      plan.requiresExtraConfirmation &&
      ctx.form.get("acknowledge") !== "yes"
    ) {
      return failure(ctx.intent, 400, "acknowledgement_required", {}, itemId);
    }

    const result = await adjustInventory(ctx.client, {
      inventoryItemId: itemGid,
      locationId: locationGid,
      expectedQuantity: expected,
      delta: plan.summary.delta,
      actionKey,
    });

    if (!result.ok) {
      const current =
        result.error.code === "conflict"
          ? {
              quantity: await getAvailableQuantity(
                ctx.client,
                itemGid,
                locationGid,
              ),
            }
          : undefined;
      return fromWriteError(ctx.intent, result.error, itemId, { current });
    }

    const tags = inventoryInvalidationTags(ctx.shop, itemId);
    if (productId) tags.push(cacheTags.product(ctx.shop, productId));
    ctx.cache.invalidateTags(tags);

    const after = result.data.quantityAfterChange ?? plan.summary.after;
    return success(
      ctx.intent,
      `Stock updated: ${plan.summary.before} → ${after}.`,
      itemId,
    );
  },
};
