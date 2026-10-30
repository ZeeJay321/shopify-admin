import { GROUPS } from "./score";
import type { CheckGroup, CheckStatus, ProductHealth } from "./types";

export type GroupSummary = {
  id: CheckGroup;
  label: string;
  /** Worst status among the group's checks. */
  status: CheckStatus;
  issueCount: number;
  earned: number;
  weight: number;
};

/** One entry per group (in display order), rolled up from the checks. */
export function summarizeGroups(health: ProductHealth): GroupSummary[] {
  return GROUPS.map((group) => {
    const checks = health.checks.filter((c) => c.group === group.id);
    const status: CheckStatus = checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "pass";
    return {
      id: group.id,
      label: group.label,
      status,
      issueCount: checks.filter((c) => c.status !== "pass").length,
      earned: Math.round(checks.reduce((sum, c) => sum + c.earned, 0)),
      weight: group.weight,
    };
  });
}
