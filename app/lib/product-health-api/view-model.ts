/**
 * Client-side helpers for the Admin UI extensions: call the app's health
 * route and turn the response into a view state. No scoring happens here;
 * the score, tone and issues all come from the server.
 *
 * Safe to bundle into extensions (no Node, Shopify server or UI imports).
 */

import type { ScoreTone } from "../product-health";
import type { CheckStatus } from "../product-health/types";
import { checkStatusTone } from "../presentation/status-tones";
import { productNumericIdOrNull } from "../shopify/gid";
import type {
  HealthErrorCode,
  HealthErrorResponse,
  HealthSummaryResponse,
} from "./contract";

export type HealthViewState =
  | { kind: "loading" }
  | { kind: "ready"; summary: HealthSummaryResponse }
  | { kind: "healthy"; summary: HealthSummaryResponse }
  | { kind: "unavailable"; message: string | null }
  | { kind: "session_expired" }
  | {
      kind: "error";
      retryable: boolean;
      /** Merchant-safe copy from the server, or null to use local copy. */
      title: string | null;
      message: string | null;
    };

export type BadgeTone = "success" | "warning" | "critical" | "neutral";

export function healthSummaryUrl(productId: string): string {
  return `/api/product-health/${encodeURIComponent(productId)}`;
}

/** `/app/products/123` -> `app:app/products/123` (opens the embedded app). */
export function reportHref(reportPath: string): string {
  return `app:${reportPath.replace(/^\/+/, "")}`;
}

/** Badge tone for a group status; shared mapping (lib/presentation). */
export function groupTone(status: CheckStatus): BadgeTone {
  return checkStatusTone(status) as BadgeTone;
}

export function badgeTone(tone: ScoreTone): BadgeTone {
  return tone;
}

type FetchLike = (url: string) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

/** Fetch and map the health summary for a product GID. Never throws. */
export async function loadHealthView(
  fetchImpl: FetchLike,
  productGid: string | null | undefined,
): Promise<HealthViewState> {
  const productId = productNumericIdOrNull(productGid);
  if (!productId) return { kind: "unavailable", message: null };

  let status: number;
  let json: unknown;
  try {
    const response = await fetchImpl(healthSummaryUrl(productId));
    status = response.status;
    json = await response.json().catch(() => null);
  } catch {
    return { kind: "error", retryable: true, title: null, message: null };
  }
  return parseHealthResponse(status, json);
}

export function parseHealthResponse(
  status: number,
  json: unknown,
): HealthViewState {
  if (status === 401) return { kind: "session_expired" };

  if (status === 200 && isSummary(json)) {
    return json.issueCount === 0
      ? { kind: "healthy", summary: json }
      : { kind: "ready", summary: json };
  }

  if (isErrorBody(json)) {
    const { code, title, message } = json.error;
    if (code === "invalid_id" || code === "not_found") {
      return { kind: "unavailable", message };
    }
    return {
      kind: "error",
      retryable: code !== "access_denied",
      title,
      message,
    };
  }

  return { kind: "error", retryable: true, title: null, message: null };
}

// --- Response validation (the route is ours, but never trust the wire) ------

const SCORE_TONES: ReadonlySet<string> = new Set([
  "success",
  "warning",
  "critical",
]);
const STATUSES: ReadonlySet<string> = new Set(["pass", "warn", "fail"]);
const ERROR_CODES: ReadonlySet<string> = new Set<HealthErrorCode>([
  "invalid_id",
  "not_found",
  "access_denied",
  "throttled",
  "upstream",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isSummary(value: unknown): value is HealthSummaryResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  const {
    product,
    score,
    scoreTone,
    issueCount,
    groups,
    topIssues,
    reportPath,
  } = value;
  return (
    isRecord(product) &&
    isString(product.id) &&
    isString(product.title) &&
    typeof score === "number" &&
    isString(scoreTone) &&
    SCORE_TONES.has(scoreTone) &&
    typeof issueCount === "number" &&
    isString(reportPath) &&
    Array.isArray(groups) &&
    groups.every(
      (g) =>
        isRecord(g) &&
        isString(g.id) &&
        isString(g.label) &&
        isString(g.status) &&
        STATUSES.has(g.status) &&
        typeof g.issueCount === "number",
    ) &&
    Array.isArray(topIssues) &&
    topIssues.every(
      (i) =>
        isRecord(i) &&
        isString(i.id) &&
        isString(i.label) &&
        isString(i.message) &&
        isString(i.status) &&
        STATUSES.has(i.status),
    )
  );
}

function isErrorBody(value: unknown): value is HealthErrorResponse {
  return (
    isRecord(value) &&
    value.ok === false &&
    isRecord(value.error) &&
    isString(value.error.code) &&
    ERROR_CODES.has(value.error.code) &&
    isString(value.error.title) &&
    isString(value.error.message)
  );
}
