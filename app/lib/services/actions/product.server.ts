/**
 * Product write actions: update SEO, change status (DRAFT <-> ACTIVE).
 *
 * Stale-data guard: productUpdate has no compare-and-set, so the form sends
 * the values the merchant saw, and we re-read the product right before the
 * mutation. A mismatch returns 409 with the current values (check-then-act;
 * a small race window remains and is documented).
 */

import type { FieldError, WriteErrorCode } from "../../actions";
import {
  isEditableStatus,
  normalizeText,
  planSeoUpdate,
  planStatusChange,
} from "../../actions";
import type { TaggedCache } from "../../cache/types";
import { scoreProduct } from "../../product-health";
import type { AdminGraphqlClient } from "../../shopify/client";
import { toNumericId, toProductGid } from "../../shopify/gid";
import {
  setProductStatus,
  updateProductSeo,
} from "../../shopify/mutations/product.server";
import type { WriteError } from "../../shopify/mutations/types";
import { getProduct } from "../../shopify/products.server";
import { productInvalidationTags } from "../../webhooks/handlers";
import type { HandlerOutcome, IntentHandler } from "./run.server";
import { failure, success } from "./run.server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export type SeoUpdateInput = {
  productId: string;
  title: string;
  description: string;
  expectedTitle: string;
  expectedDescription: string;
};

/** Core SEO update, shared by the single action and the batch. */
export async function applySeoUpdate(
  ctx: {
    client: AdminGraphqlClient;
    shop: string;
    cache: TaggedCache;
    intent: string;
  },
  input: SeoUpdateInput,
): Promise<HandlerOutcome> {
  const gid = toProductGid(input.productId);
  const id = toNumericId(gid);
  const record = await getProduct(ctx.client, gid);
  const current = {
    title: normalizeText(record.snapshot.seoTitle ?? ""),
    description: normalizeText(record.snapshot.seoDescription ?? ""),
  };

  if (
    current.title !== normalizeText(input.expectedTitle) ||
    current.description !== normalizeText(input.expectedDescription)
  ) {
    return failure(ctx.intent, 409, "conflict", { current }, id);
  }

  const plan = planSeoUpdate({
    current,
    next: { title: input.title, description: input.description },
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

  const result = await updateProductSeo(ctx.client, gid, plan.values);
  if (!result.ok) return fromWriteError(ctx.intent, result.error, id);

  ctx.cache.invalidateTags(productInvalidationTags(ctx.shop, id));
  return success(ctx.intent, `SEO updated for "${record.snapshot.title}".`, id);
}

export const updateSeoHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: true,
  run: (ctx) =>
    applySeoUpdate(ctx, {
      productId: text(ctx.form, "productId"),
      title: text(ctx.form, "title"),
      description: text(ctx.form, "description"),
      expectedTitle: text(ctx.form, "expectedTitle"),
      expectedDescription: text(ctx.form, "expectedDescription"),
    }),
};

export const setStatusHandler: IntentHandler = {
  scope: "write_products",
  requiresConfirmation: true,
  async run(ctx) {
    const gid = toProductGid(text(ctx.form, "productId"));
    const id = toNumericId(gid);
    const record = await getProduct(ctx.client, gid);
    const current = record.snapshot.status;

    if (current !== text(ctx.form, "expectedStatus")) {
      return failure(
        ctx.intent,
        409,
        "conflict",
        { current: { status: current } },
        id,
      );
    }

    const next = text(ctx.form, "status");
    const plan = planStatusChange({
      current,
      next,
      checks: scoreProduct(record.snapshot).checks,
    });
    if (!plan.valid || !isEditableStatus(next)) {
      return failure(
        ctx.intent,
        422,
        "validation",
        { fieldErrors: plan.errors },
        id,
      );
    }
    if (
      plan.requiresExtraConfirmation &&
      ctx.form.get("acknowledge") !== "yes"
    ) {
      return failure(ctx.intent, 400, "acknowledgement_required", {}, id);
    }

    const result = await setProductStatus(ctx.client, gid, next);
    if (!result.ok) return fromWriteError(ctx.intent, result.error, id);

    ctx.cache.invalidateTags(productInvalidationTags(ctx.shop, id));
    return success(
      ctx.intent,
      next === "ACTIVE"
        ? `"${record.snapshot.title}" is now active.`
        : `"${record.snapshot.title}" moved to draft.`,
      id,
    );
  },
};

const WRITE_ERROR_STATUS: Record<WriteError["code"], [number, WriteErrorCode]> =
  {
    validation: [422, "validation"],
    conflict: [409, "conflict"],
    not_found: [404, "not_found"],
    permission: [403, "permission_needed"],
    failed: [502, "failed"],
  };

/** Map a mutation WriteError to an outcome; raw detail goes to logs only. */
export function fromWriteError(
  intent: string,
  error: WriteError,
  resourceId: string,
  extra: { current?: Record<string, string | number | null> } = {},
): HandlerOutcome {
  console.warn(
    `[actions] ${intent} resource=${resourceId} shopify_user_error=${error.code}`,
  );
  const [status, code] = WRITE_ERROR_STATUS[error.code];
  const fieldErrors: FieldError[] | undefined =
    error.code === "validation" && error.field
      ? [
          {
            field: error.field,
            message:
              "Shopify didn't accept this value. Check it and try again.",
          },
        ]
      : undefined;
  return failure(intent, status, code, { ...extra, fieldErrors }, resourceId);
}
