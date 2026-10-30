export * from "./types";
export {
  scoreProduct,
  isPlaceholderTitle,
  GROUPS,
  WEIGHTS,
  MIN_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  MIN_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_DESCRIPTION_LENGTH,
} from "./score";
export { aggregateStoreHealth, topIssues } from "./aggregate";
export type { IssueCount, StoreHealth } from "./aggregate";
export { summarizeGroups } from "./summary";
export type { GroupSummary } from "./summary";

export type ScoreTone = "success" | "warning" | "critical";

/** Badge tone for a 0-100 score. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "critical";
}
