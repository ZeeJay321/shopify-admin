/**
 * Product mutations (write_products) via `productUpdate` (2026-07).
 * `productChangeStatus` is deprecated in 2026-07, so status also goes through
 * productUpdate. productUpdate userErrors are `{ field, message }` (no code).
 */

import type {
  ProductUpdateSeoMutation,
  ProductUpdateStatusMutation,
} from "../../../types/admin.generated";
import type { AdminGraphqlClient } from "../client";
import { runQuery } from "../client";
import { toProductGid } from "../gid";
import type { MutationResult, WriteError } from "./types";

const PRODUCT_UPDATE_SEO = `#graphql
  mutation ProductUpdateSeo($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id seo { title description } }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_STATUS = `#graphql
  mutation ProductUpdateStatus($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status }
      userErrors { field message }
    }
  }
`;

type UserError = { field?: ReadonlyArray<string> | null; message: string };

export async function updateProductSeo(
  client: AdminGraphqlClient,
  productId: string,
  seo: { title: string; description: string },
): Promise<
  MutationResult<{ title: string | null; description: string | null }>
> {
  const id = toProductGid(productId);
  const data = await runQuery<ProductUpdateSeoMutation>(
    client,
    "Update product SEO",
    PRODUCT_UPDATE_SEO,
    {
      product: { id, seo: { title: seo.title, description: seo.description } },
    },
    { maxRetries: 1 },
  );
  const payload = data.productUpdate;
  const error = mapProductUserErrors(payload?.userErrors ?? []);
  if (error) return { ok: false, error };
  if (!payload?.product) {
    return {
      ok: false,
      error: { code: "not_found", detail: "no product returned" },
    };
  }
  return {
    ok: true,
    data: {
      title: payload.product.seo.title ?? null,
      description: payload.product.seo.description ?? null,
    },
  };
}

export async function setProductStatus(
  client: AdminGraphqlClient,
  productId: string,
  status: "ACTIVE" | "DRAFT",
): Promise<MutationResult<{ status: string }>> {
  const id = toProductGid(productId);
  const data = await runQuery<ProductUpdateStatusMutation>(
    client,
    "Update product status",
    PRODUCT_UPDATE_STATUS,
    { product: { id, status } },
    { maxRetries: 1 },
  );
  const payload = data.productUpdate;
  const error = mapProductUserErrors(payload?.userErrors ?? []);
  if (error) return { ok: false, error };
  if (!payload?.product) {
    return {
      ok: false,
      error: { code: "not_found", detail: "no product returned" },
    };
  }
  return { ok: true, data: { status: payload.product.status } };
}

/** Map productUpdate userErrors (no codes) by field path. */
export function mapProductUserErrors(
  userErrors: ReadonlyArray<UserError>,
): WriteError | null {
  if (userErrors.length === 0) return null;
  const first = userErrors[0];
  const path = first.field ?? [];
  const detail = userErrors
    .map((e) => `${(e.field ?? []).join(".")}: ${e.message}`)
    .join("; ");

  if (
    path.includes("id") ||
    /not (be )?found|does not exist/i.test(first.message)
  ) {
    return { code: "not_found", detail };
  }
  const leaf = path[path.length - 1];
  if (path.includes("seo") && (leaf === "title" || leaf === "description")) {
    return { code: "validation", field: leaf, detail };
  }
  if (leaf === "status") return { code: "validation", field: "status", detail };
  return { code: "validation", field: "form", detail };
}
