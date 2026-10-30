/**
 * Shared runner for write actions (React Router route `action`s).
 *
 * Order of checks, before any Shopify call:
 *   1. POST only (405 otherwise)
 *   2. authenticate.admin (session token; throws a Response if not signed in)
 *   3. known intent (400)
 *   4. write scope granted for this intent (403 permission_needed)
 *   5. explicit confirmation flag `confirm=yes` for mutating intents (400)
 * Then the intent handler validates ids/inputs, checks for stale data,
 * mutates, and invalidates cache tags only on success.
 *
 * The shop always comes from the verified session, never from the request.
 * Logs carry only intent, shop, resource id and outcome.
 */

import type { WriteActionResult, WriteErrorCode } from "../../actions";
import { writeErrorMessage } from "../../actions";
import type { TaggedCache } from "../../cache/types";
import type { AdminGraphqlClient } from "../../shopify/client";
import type { ShopifyApiErrorKind } from "../../shopify/errors";
import { isShopifyApiError } from "../../shopify/errors";
import { hasScope } from "../../shopify/scopes";

export type ActionContext = {
  client: AdminGraphqlClient;
  /** From the verified session only. */
  shop: string;
  cache: TaggedCache;
  form: FormData;
  intent: string;
};

export type HandlerOutcome = {
  status: number;
  result: WriteActionResult;
  /** For logs only. */
  resourceId?: string;
};

export type IntentHandler = {
  /** Required scope, or null for non-writing intents (e.g. recheck). */
  scope: "write_products" | "write_inventory" | null;
  /** Mutating intents require `confirm=yes`. */
  requiresConfirmation: boolean;
  run(ctx: ActionContext): Promise<HandlerOutcome>;
};

export type AuthenticateAdmin = (request: Request) => Promise<{
  admin: AdminGraphqlClient;
  session: { shop: string; scope?: string | null };
}>;

export async function runWriteAction(
  request: Request,
  {
    authenticate,
    cache,
    handlers,
  }: {
    authenticate: AuthenticateAdmin;
    cache: TaggedCache;
    handlers: Record<string, IntentHandler>;
  },
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const { admin, session } = await authenticate(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const handler = Object.hasOwn(handlers, intent)
    ? handlers[intent]
    : undefined;

  if (!handler) {
    return respond(shop, intent, undefined, failure(intent, 400, "validation"));
  }
  if (handler.scope && !hasScope(session.scope, handler.scope)) {
    return respond(
      shop,
      intent,
      undefined,
      failure(intent, 403, "permission_needed"),
    );
  }
  if (handler.requiresConfirmation && form.get("confirm") !== "yes") {
    return respond(
      shop,
      intent,
      undefined,
      failure(intent, 400, "confirmation_required"),
    );
  }

  let outcome: HandlerOutcome;
  try {
    outcome = await handler.run({ client: admin, shop, cache, form, intent });
  } catch (error) {
    if (!isShopifyApiError(error)) throw error; // auth Responses, bugs
    console.warn(
      `[actions] ${intent} shop=${shop} shopify_error=${error.kind}`,
    );
    outcome = fromShopifyError(intent, error.kind);
  }
  return respond(shop, intent, outcome.resourceId, outcome);
}

const KIND_TO_OUTCOME: Record<ShopifyApiErrorKind, [number, WriteErrorCode]> = {
  access_denied: [403, "permission_needed"],
  throttled: [429, "throttled"],
  invalid_id: [400, "validation"],
  not_found: [404, "not_found"],
  user_errors: [422, "validation"],
  graphql: [502, "failed"],
  http: [502, "failed"],
};

export function fromShopifyError(
  intent: string,
  kind: ShopifyApiErrorKind,
): HandlerOutcome {
  const [status, code] = KIND_TO_OUTCOME[kind];
  return failure(intent, status, code);
}

export function failure(
  intent: string,
  status: number,
  code: WriteErrorCode,
  extra: Partial<Extract<WriteActionResult, { ok: false }>> = {},
  resourceId?: string,
): HandlerOutcome {
  return {
    status,
    resourceId,
    result: {
      ok: false,
      intent,
      code,
      message: writeErrorMessage(code),
      ...extra,
    },
  };
}

export function success(
  intent: string,
  message: string,
  resourceId?: string,
  extra: Partial<Extract<WriteActionResult, { ok: true }>> = {},
): HandlerOutcome {
  return {
    status: 200,
    resourceId,
    result: { ok: true, intent, message, ...extra },
  };
}

function respond(
  shop: string,
  intent: string,
  resourceId: string | undefined,
  outcome: HandlerOutcome,
): Response {
  const code = outcome.result.ok ? "ok" : outcome.result.code;
  console.info(
    `[actions] ${intent || "unknown"} shop=${shop} resource=${resourceId ?? "-"} outcome=${outcome.status} ${code}`,
  );
  return Response.json(outcome.result, { status: outcome.status });
}
