import type { CheckId, ProductHealth } from "./types";

export type IssueCount = {
  checkId: CheckId;
  label: string;
  count: number;
};

export type StoreHealth = {
  sampleSize: number;
  /** Rounded average score; null when there are no products. */
  averageScore: number | null;
  productsWithIssues: number;
  /** One entry per failing/warning check, most common first. */
  issueCounts: IssueCount[];
};

export function aggregateStoreHealth(
  results: ReadonlyArray<ProductHealth>,
): StoreHealth {
  const counts = new Map<CheckId, IssueCount>();
  let total = 0;
  let productsWithIssues = 0;

  for (const result of results) {
    total += result.score;
    if (result.issues.length > 0) productsWithIssues++;
    for (const issue of result.issues) {
      const entry = counts.get(issue.id);
      if (entry) {
        entry.count++;
      } else {
        counts.set(issue.id, {
          checkId: issue.id,
          label: issue.label,
          count: 1,
        });
      }
    }
  }

  const issueCounts = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  return {
    sampleSize: results.length,
    averageScore: results.length ? Math.round(total / results.length) : null,
    productsWithIssues,
    issueCounts,
  };
}

export function topIssues(health: StoreHealth, n: number): IssueCount[] {
  return health.issueCounts.slice(0, n);
}
