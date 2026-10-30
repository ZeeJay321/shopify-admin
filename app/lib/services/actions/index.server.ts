/** Intent registries for each page's route action. */

import { appCache } from "../../cache/index.server";
import type { IntentHandler } from "./run.server";
import { adjustInventoryHandler } from "./inventory.server";
import { setStatusHandler, updateSeoHandler } from "./product.server";
import {
  applySeoBatchHandler,
  previewSeoBatchHandler,
} from "./seo-batch.server";
import { invalidateReadiness } from "../readiness.server";
import { success } from "./run.server";

export const productActionHandlers: Record<string, IntentHandler> = {
  update_seo: updateSeoHandler,
  set_status: setStatusHandler,
};

export const inventoryActionHandlers: Record<string, IntentHandler> = {
  adjust_inventory: adjustInventoryHandler,
};

/** Clears only this app's cached report; no Shopify write. */
const recheckHandler: IntentHandler = {
  scope: null,
  requiresConfirmation: false,
  async run(ctx) {
    invalidateReadiness(ctx.shop, ctx.cache);
    return success(ctx.intent, "Readiness rechecked.");
  },
};

export const readinessActionHandlers: Record<string, IntentHandler> = {
  recheck: recheckHandler,
  preview_seo_batch: previewSeoBatchHandler,
  apply_seo_batch: applySeoBatchHandler,
};

export { appCache };
export { runWriteAction } from "./run.server";
