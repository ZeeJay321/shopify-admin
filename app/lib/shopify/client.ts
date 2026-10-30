/**
 * Thin, typed wrapper around the authenticated Admin GraphQL client.
 *
 * Centralizes:
 * - GraphQL `errors` handling (both returned in the body and thrown by the
 *   Shopify library as a GraphqlQueryError-like object).
 * - HTTP failures (the library throws a `Response` for these).
 * - Throttling: reads `extensions.cost.throttleStatus`, retries THROTTLED
 *   queries after the time the bucket needs to refill, and backs off before
 *   returning when the bucket is too low for another query of the same cost.
 * - Mutation `userErrors` via `assertNoUserErrors` (for phase 2+).
 *
 * Auth responses (401 / redirects) are re-thrown untouched so the template's
 * session/token-exchange handling keeps working.
 */

import { MAX_THROTTLE_RETRIES, MAX_THROTTLE_WAIT_MS } from "../config";
import { ShopifyApiError } from "./errors";

export type GraphQLVariables = Record<string, unknown>;

/** The subset of `admin` from `authenticate.admin()` this layer depends on. */
export type AdminGraphqlClient = {
  graphql(
    query: string,
    options?: { variables?: GraphQLVariables },
  ): Promise<Response>;
};

export type ThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};

export type QueryCost = {
  requestedQueryCost: number;
  throttleStatus: ThrottleStatus;
};

type GraphQLErrorEntry = { message: string; code: string | undefined };

type NormalizedPayload = {
  data: unknown;
  errors: GraphQLErrorEntry[];
  cost: QueryCost | undefined;
};

export type RunQueryOptions = {
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const MIN_THROTTLE_WAIT_MS = 250;

/**
 * Run a query and return its `data`, typed by the caller.
 * Throws `ShopifyApiError` for everything except auth responses.
 */
export async function runQuery<TData>(
  client: AdminGraphqlClient,
  operation: string,
  query: string,
  variables?: GraphQLVariables,
  options: RunQueryOptions = {},
): Promise<TData> {
  const maxRetries = options.maxRetries ?? MAX_THROTTLE_RETRIES;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    const outcome = await execute(client, operation, query, variables);

    if (outcome.type === "throttled") {
      if (attempt >= maxRetries) {
        throw new ShopifyApiError(
          "throttled",
          operation,
          `still throttled after ${maxRetries} retries`,
        );
      }
      await sleep(outcome.waitMs);
      continue;
    }

    const { payload } = outcome;
    throwForGraphQLErrors(operation, payload.errors);

    if (!isRecord(payload.data)) {
      throw new ShopifyApiError("graphql", operation, "response had no data");
    }

    // Proactive back-off: if another query this expensive would be throttled,
    // wait for the bucket to refill instead of failing the next call.
    if (payload.cost) {
      const wait = refillWaitMs(payload.cost);
      if (wait > 0) await sleep(wait);
    }

    return payload.data as TData;
  }
}

type UserError = {
  field?: ReadonlyArray<string> | null;
  message: string;
};

/** Throw if a mutation returned userErrors. Messages stay server-side. */
export function assertNoUserErrors(
  operation: string,
  userErrors: ReadonlyArray<UserError> | null | undefined,
): void {
  if (userErrors && userErrors.length > 0) {
    throw new ShopifyApiError(
      "user_errors",
      operation,
      userErrors
        .map((e) =>
          e.field?.length ? `${e.field.join(".")}: ${e.message}` : e.message,
        )
        .join("; "),
    );
  }
}

/** Milliseconds until the bucket can afford another query of this cost. */
export function refillWaitMs(cost: QueryCost): number {
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const deficit = cost.requestedQueryCost - currentlyAvailable;
  if (deficit <= 0 || restoreRate <= 0) return 0;
  return clampWait(Math.ceil((deficit / restoreRate) * 1000));
}

// ---------------------------------------------------------------------------

type ExecuteOutcome =
  | { type: "ok"; payload: NormalizedPayload }
  | { type: "throttled"; waitMs: number };

async function execute(
  client: AdminGraphqlClient,
  operation: string,
  query: string,
  variables: GraphQLVariables | undefined,
): Promise<ExecuteOutcome> {
  let response: Response;
  try {
    response = await client.graphql(query, { variables });
  } catch (error) {
    if (error instanceof Response) {
      return handleHttpFailure(operation, error);
    }
    const thrownBody = graphqlQueryErrorBody(error);
    if (thrownBody) {
      return classify(normalizePayload(thrownBody));
    }
    throw new ShopifyApiError("http", operation, "request failed");
  }

  if (!response.ok) {
    return handleHttpFailure(operation, response);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ShopifyApiError("http", operation, "response was not JSON");
  }
  return classify(normalizePayload(json));
}

function classify(payload: NormalizedPayload): ExecuteOutcome {
  if (payload.errors.some((e) => e.code === "THROTTLED")) {
    const waitMs = payload.cost
      ? Math.max(refillWaitMs(payload.cost), MIN_THROTTLE_WAIT_MS)
      : 1000;
    return { type: "throttled", waitMs };
  }
  return { type: "ok", payload };
}

function handleHttpFailure(
  operation: string,
  response: Response,
): ExecuteOutcome {
  const { status } = response;
  // Session expired / needs re-auth: let the template's boundary handle it.
  if (status === 401 || (status >= 300 && status < 400)) {
    throw response;
  }
  if (status === 403) {
    throw new ShopifyApiError("access_denied", operation, "HTTP 403");
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? clampWait(retryAfter * 1000)
        : 1000;
    return { type: "throttled", waitMs };
  }
  throw new ShopifyApiError("http", operation, `HTTP ${status}`);
}

function throwForGraphQLErrors(
  operation: string,
  errors: GraphQLErrorEntry[],
): void {
  if (errors.length === 0) return;
  const detail = errors.map((e) => e.message).join("; ");
  if (errors.some((e) => e.code === "ACCESS_DENIED")) {
    throw new ShopifyApiError("access_denied", operation, detail);
  }
  throw new ShopifyApiError("graphql", operation, detail);
}

/**
 * Accepts both shapes:
 * - plain GraphQL JSON: `{ data, errors: [...], extensions }`
 * - Shopify library client body: `{ data, errors: { graphQLErrors: [...] }, extensions }`
 */
function normalizePayload(body: unknown): NormalizedPayload {
  if (!isRecord(body)) return { data: undefined, errors: [], cost: undefined };

  let rawErrors: unknown[] = [];
  if (Array.isArray(body.errors)) {
    rawErrors = body.errors;
  } else if (
    isRecord(body.errors) &&
    Array.isArray(body.errors.graphQLErrors)
  ) {
    rawErrors = body.errors.graphQLErrors;
  } else if (isRecord(body.errors)) {
    rawErrors = [body.errors];
  }

  return {
    data: body.data,
    errors: rawErrors.map(toErrorEntry),
    cost: readCost(body.extensions),
  };
}

function toErrorEntry(raw: unknown): GraphQLErrorEntry {
  if (!isRecord(raw)) return { message: "Unknown error", code: undefined };
  const message =
    typeof raw.message === "string" ? raw.message : "Unknown error";
  const code =
    isRecord(raw.extensions) && typeof raw.extensions.code === "string"
      ? raw.extensions.code
      : undefined;
  return { message, code };
}

function readCost(extensions: unknown): QueryCost | undefined {
  if (!isRecord(extensions) || !isRecord(extensions.cost)) return undefined;
  const { requestedQueryCost, throttleStatus } = extensions.cost;
  if (
    typeof requestedQueryCost !== "number" ||
    !isRecord(throttleStatus) ||
    typeof throttleStatus.maximumAvailable !== "number" ||
    typeof throttleStatus.currentlyAvailable !== "number" ||
    typeof throttleStatus.restoreRate !== "number"
  ) {
    return undefined;
  }
  return {
    requestedQueryCost,
    throttleStatus: {
      maximumAvailable: throttleStatus.maximumAvailable,
      currentlyAvailable: throttleStatus.currentlyAvailable,
      restoreRate: throttleStatus.restoreRate,
    },
  };
}

/** The Shopify library throws GraphqlQueryError with the client body on `.body`. */
function graphqlQueryErrorBody(error: unknown): Record<string, unknown> | null {
  if (
    error instanceof Error &&
    "body" in error &&
    isRecord(error.body) &&
    "errors" in error.body
  ) {
    return error.body;
  }
  return null;
}

function clampWait(ms: number): number {
  return Math.min(Math.max(ms, 0), MAX_THROTTLE_WAIT_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
