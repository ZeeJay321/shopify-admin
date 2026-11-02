/**
 * The single source of truth for badge/progress tones across the app (and
 * the Admin UI extensions, via status-tones.ts). Pure; no UI imports.
 *
 * - score >= 80 success, 50-79 warning, < 50 critical (see scoreTone)
 * - severity HIGH critical, MEDIUM warning, LOW info
 * - red ("critical") only for problems, never for passing items
 */

import { scoreTone } from "../product-health";

export * from "./status-tones";
export { scoreTone };

/** Verbal band for a 0-100 score, used in accessible labels. */
export function scoreBand(score: number): "good" | "needs work" | "poor" {
  const tone = scoreTone(score);
  return tone === "success"
    ? "good"
    : tone === "warning"
      ? "needs work"
      : "poor";
}

const VERDICTS = {
  good: "Good",
  "needs work": "Needs work",
  poor: "Poor",
} as const;

/** Display verdict for a 0-100 score: "Good", "Needs work" or "Poor". */
export function scoreVerdict(
  score: number,
): (typeof VERDICTS)[keyof typeof VERDICTS] {
  return VERDICTS[scoreBand(score)];
}
