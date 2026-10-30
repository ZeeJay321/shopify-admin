import { TOP_AT_RISK_LIMIT } from "../config";
import type { InventorySummary, RiskLevel, VariantRisk } from "./types";

const SEVERITY: Record<RiskLevel, number> = {
  critical: 0,
  low: 1,
  healthy: 2,
  untracked: 3,
};

export function summarizeInventory(
  risks: ReadonlyArray<VariantRisk>,
  topLimit: number = TOP_AT_RISK_LIMIT,
): InventorySummary {
  const counts: Record<RiskLevel, number> = {
    critical: 0,
    low: 0,
    healthy: 0,
    untracked: 0,
  };
  for (const r of risks) counts[r.risk]++;

  const topAtRisk = risks
    .filter((r) => r.risk === "critical" || r.risk === "low")
    .sort(compareRisk)
    .slice(0, topLimit);

  return { total: risks.length, counts, topAtRisk };
}

/** Most severe first, then least available, then a stable title order. */
export function compareRisk(a: VariantRisk, b: VariantRisk): number {
  return (
    SEVERITY[a.risk] - SEVERITY[b.risk] ||
    a.available - b.available ||
    a.variant.productTitle.localeCompare(b.variant.productTitle) ||
    a.variant.variantTitle.localeCompare(b.variant.variantTitle)
  );
}
