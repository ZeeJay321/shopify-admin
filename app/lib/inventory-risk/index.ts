export * from "./types";
export { classifyVariant, riskFor, DEFAULT_THRESHOLDS } from "./classify";
export { summarizeInventory, compareRisk } from "./aggregate";

export const RISK_LABELS = {
  critical: "Critical",
  low: "Low stock",
  healthy: "Healthy",
  untracked: "Not tracked",
} as const;

export const RISK_TONES = {
  critical: "critical",
  low: "warning",
  healthy: "success",
  untracked: "neutral",
} as const;
