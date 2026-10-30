/**
 * Inventory risk classification (deterministic, no I/O).
 *
 * | Risk      | Rule (tracked variants)                                   |
 * |-----------|-----------------------------------------------------------|
 * | CRITICAL  | available <= CRITICAL_STOCK_THRESHOLD (2); includes 0 / <0 |
 * | LOW       | available <= LOW_STOCK_THRESHOLD (5)                       |
 * | HEALTHY   | available >  LOW_STOCK_THRESHOLD                           |
 * | UNTRACKED | Shopify doesn't track inventory: excluded from risk        |
 *
 * "available" is the sum across all locations, or the quantity at one
 * location when a location filter is applied (0 if not stocked there).
 * LOW_STOCK_THRESHOLD is shared with the phase 1 "Low stock" health check.
 */

import { CRITICAL_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD } from "../config";
import type {
  RiskLevel,
  RiskThresholds,
  VariantInventory,
  VariantRisk,
} from "./types";

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  critical: CRITICAL_STOCK_THRESHOLD,
  low: LOW_STOCK_THRESHOLD,
};

export function classifyVariant(
  variant: VariantInventory,
  {
    locationId = null,
    thresholds = DEFAULT_THRESHOLDS,
  }: { locationId?: string | null; thresholds?: RiskThresholds } = {},
): VariantRisk {
  const available = locationId
    ? (variant.levels.find((l) => l.locationId === locationId)?.available ?? 0)
    : variant.levels.reduce((sum, l) => sum + l.available, 0);

  return {
    variant,
    risk: variant.tracked ? riskFor(available, thresholds) : "untracked",
    available,
    byLocation: variant.levels,
    outOfStock: variant.tracked && available <= 0,
  };
}

export function riskFor(
  available: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): Exclude<RiskLevel, "untracked"> {
  if (available <= thresholds.critical) return "critical";
  if (available <= thresholds.low) return "low";
  return "healthy";
}
