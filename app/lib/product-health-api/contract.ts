/**
 * JSON contract for GET /api/product-health/:id, shared by the app route and
 * the Admin UI extensions. Types only, so extensions bundle no server code.
 */

import type { ScoreTone } from "../product-health";
import type { CheckGroup, CheckId, CheckStatus } from "../product-health/types";

export const TOP_ISSUES_LIMIT = 3;

export type HealthSummaryGroup = {
  id: CheckGroup;
  label: string;
  status: CheckStatus;
  issueCount: number;
};

export type HealthSummaryIssue = {
  id: CheckId;
  label: string;
  status: Exclude<CheckStatus, "pass">;
  message: string;
};

export type HealthSummaryResponse = {
  ok: true;
  product: { id: string; title: string };
  score: number;
  scoreTone: ScoreTone;
  issueCount: number;
  groups: HealthSummaryGroup[];
  topIssues: HealthSummaryIssue[];
  /** App path of the full report, e.g. "/app/products/123". */
  reportPath: string;
};

export type HealthErrorCode =
  "invalid_id" | "not_found" | "access_denied" | "throttled" | "upstream";

export type HealthErrorResponse = {
  ok: false;
  error: { code: HealthErrorCode; title: string; message: string };
};

export type HealthResponse = HealthSummaryResponse | HealthErrorResponse;
