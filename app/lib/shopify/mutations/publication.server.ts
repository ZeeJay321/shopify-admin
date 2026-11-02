/**
 * Sales channel publishing (write_publications) via `publishablePublish`
 * (2026-07). Publishing an already-published product is a no-op in Shopify;
 * the service checks first so the merchant sees "Already published".
 * userErrors are `{ field, message }`.
 */

import type { PublishProductMutation } from "../../../types/admin.generated";
import type { AdminGraphqlClient } from "../client";
import { runQuery } from "../client";
import { toProductGid } from "../gid";
import type { MutationResult, WriteError } from "./types";

const PUBLISH_PRODUCT = `#graphql
  mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

const PUBLICATION_GID = /^gid:\/\/shopify\/Publication\/\d+$/;

export function isPublicationGid(value: string): boolean {
  return PUBLICATION_GID.test(value);
}

export async function publishProduct(
  client: AdminGraphqlClient,
  productId: string,
  publicationId: string,
): Promise<MutationResult<{ published: true }>> {
  if (!isPublicationGid(publicationId)) {
    return {
      ok: false,
      error: { code: "validation", field: "publicationId", detail: "bad id" },
    };
  }
  const data = await runQuery<PublishProductMutation>(
    client,
    "Publish product",
    PUBLISH_PRODUCT,
    { id: toProductGid(productId), input: [{ publicationId }] },
    { maxRetries: 1 },
  );
  const error = mapPublishUserErrors(data.publishablePublish?.userErrors ?? []);
  if (error) return { ok: false, error };
  if (!data.publishablePublish) {
    return { ok: false, error: { code: "failed", detail: "no payload" } };
  }
  return { ok: true, data: { published: true } };
}

type UserError = { field?: ReadonlyArray<string> | null; message: string };

export function mapPublishUserErrors(
  userErrors: ReadonlyArray<UserError>,
): WriteError | null {
  if (userErrors.length === 0) return null;
  const detail = userErrors
    .map((e) => `${(e.field ?? []).join(".")}: ${e.message}`)
    .join("; ");
  const first = userErrors[0];
  if (/not (be )?found|does not exist|invalid id/i.test(first.message)) {
    return { code: "not_found", detail };
  }
  if (/access|permission/i.test(first.message)) {
    return { code: "permission", detail };
  }
  return { code: "validation", field: "form", detail };
}
