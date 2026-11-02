/**
 * Inline fixes from tables (phase 6): publish to a sales channel, activate
 * drafts, edit title/description. Same safety pipeline as phase 5
 * (runWriteAction: POST, session shop, scope, confirm=yes), then server
 * re-validation, stale checks and cache invalidation on success only.
 */

import {
  normalizeDescription,
  normalizeText,
  parseBulkIds,
  planContentUpdate,
  planStatusChange,
  summarizeBulk,
  textToHtml,
} from "../../actions";
import { cacheTags } from "../../cache/types";
import { scoreProduct } from "../../product-health";
import { toNumericId, toProductGid } from "../../shopify/gid";
import {
  setProductStatus,
  updateProductContent,
} from "../../shopify/mutations/product.server";
import {
  isPublicationGid,
  publishProduct,
} from "../../shopify/mutations/publication.server";
import { getProduct } from "../../shopify/products.server";
import {
  getPublishedFlags,
  getSalesChannels,
} from "../../shopify/publications.server";
import { productInvalidationTags } from "../../webhooks/handlers";
import { bulkItems, itemErrorMessage, runSequential } from "./bulk.server";
import { fromWriteError } from "./product.server";
import type {
  ActionContext,
  HandlerOutcome,
  IntentHandler,
} from "./run.server";
import { failure, success } from "./run.server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

function parseIdsOrFail(ctx: ActionContext): string[] | HandlerOutcome {
  const parsed = parseBulkIds(ctx.form.getAll("productId"));
  if (parsed.ok) return parsed.ids;
  return failure(ctx.intent, 400, "validation", {
    fieldErrors: [parsed.error],
  });
}

/** Publish 1..BULK_ACTION_MAX products to one sales channel. */
export const publishProductsHandler: IntentHandler = {
  scope: "write_publications",
  requiresConfirmation: true,
  async run(ctx) {
    const ids = parseIdsOrFail(ctx);
    if (!Array.isArray(ids)) return ids;
    const publicationId = text(ctx.form, "publicationId");
    if (!isPublicationGid(publicationId)) {
      return failure(ctx.intent, 400, "validation", {
        fieldErrors: [
          { field: "publicationId", message: "Choose a sales channel." },
        ],
      });
    }
    // Re-validate the channel on the server; its name comes from Shopify.
    const channel = (await getSalesChannels(ctx.client)).find(
      (c) => c.id === publicationId,
    );
    if (!channel) return failure(ctx.intent, 404, "not_found");

    // Current state right before writing: idempotent and stale-safe.
    const flags = await getPublishedFlags(ctx.client, ids, publicationId);
    const results = await runSequential(
      bulkItems(ctx.form, ids),
      async (item) => {
        const published = flags.get(item.productId);
        if (published === undefined) {
          return { ok: false, message: "This product no longer exists." };
        }
        if (published) {
          return { ok: true, message: `Already published to ${channel.name}.` };
        }
        const result = await publishProduct(
          ctx.client,
          item.productId,
          publicationId,
        );
        if (!result.ok)
          return { ok: false, message: itemErrorMessage(result.error.code) };
        ctx.cache.invalidateTags(
          productInvalidationTags(ctx.shop, item.productId),
        );
        return { ok: true, message: `Published to ${channel.name}.` };
      },
      ctx.intent,
    );
    if (results.some((r) => r.ok)) {
      ctx.cache.invalidateTags([
        cacheTags.publications(ctx.shop),
        cacheTags.readiness(ctx.shop),
      ]);
    }
    return success(
      ctx.intent,
      summarizeBulk(results).message,
      `${ids.length} products`,
      {
        results,
      },
    );
  },
};

/**
 * Activate drafts. Products with failing critical checks are skipped: they
 * need the single-product dialog and its extra acknowledgement.
 */
export const activateProductsHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: true,
  async run(ctx) {
    const ids = parseIdsOrFail(ctx);
    if (!Array.isArray(ids)) return ids;
    const results = await runSequential(
      bulkItems(ctx.form, ids),
      async (item) => {
        const gid = toProductGid(item.productId);
        const record = await getProduct(ctx.client, gid);
        const plan = planStatusChange({
          current: record.snapshot.status,
          next: "ACTIVE",
          checks: scoreProduct(record.snapshot).checks,
        });
        if (!plan.valid) return { ok: false, message: plan.errors[0].message };
        if (plan.requiresExtraConfirmation) {
          return {
            ok: false,
            message:
              "Skipped: it has critical issues. Open it to review and publish.",
          };
        }
        const result = await setProductStatus(ctx.client, gid, "ACTIVE");
        if (!result.ok)
          return { ok: false, message: itemErrorMessage(result.error.code) };
        ctx.cache.invalidateTags(
          productInvalidationTags(ctx.shop, item.productId),
        );
        return { ok: true, message: "Now active." };
      },
      ctx.intent,
    );
    return success(
      ctx.intent,
      summarizeBulk(results).message,
      `${ids.length} products`,
      {
        results,
      },
    );
  },
};

/** Edit title and/or plain-text description (sent as escaped HTML). */
export const updateContentHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: true,
  async run(ctx) {
    const gid = toProductGid(text(ctx.form, "productId"));
    const id = toNumericId(gid);
    const record = await getProduct(ctx.client, gid);
    const current = {
      title: record.snapshot.title,
      description: record.snapshot.description,
    };
    if (
      normalizeText(current.title) !==
        normalizeText(text(ctx.form, "expectedTitle")) ||
      normalizeDescription(current.description) !==
        normalizeDescription(text(ctx.form, "expectedDescription"))
    ) {
      return failure(ctx.intent, 409, "conflict", { current }, id);
    }

    const plan = planContentUpdate({
      current,
      next: {
        title: text(ctx.form, "title"),
        description: text(ctx.form, "description"),
      },
    });
    if (!plan.valid) {
      return failure(
        ctx.intent,
        422,
        "validation",
        { fieldErrors: plan.errors },
        id,
      );
    }

    const result = await updateProductContent(ctx.client, gid, {
      ...(plan.changed.title ? { title: plan.values.title } : {}),
      ...(plan.changed.description
        ? { descriptionHtml: textToHtml(plan.values.description) }
        : {}),
    });
    if (!result.ok) return fromWriteError(ctx.intent, result.error, id);

    ctx.cache.invalidateTags(productInvalidationTags(ctx.shop, id));
    return success(ctx.intent, `Saved "${plan.values.title}".`, id);
  },
};
