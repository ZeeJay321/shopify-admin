/**
 * Runs readiness checks and computes the weighted score:
 *
 *   score = round(100 * Σ(weight × checkScore) / Σ(weight))
 *
 * over checks that apply (checkScore !== null). Nothing is hardcoded: adding,
 * removing or re-weighting a check changes the result.
 */

import { READINESS_AFFECTED_LIMIT, READINESS_WARN_AT } from "../config";
import { DEFAULT_CHECKS, liveProducts } from "./checks";
import type {
  CheckConfig,
  CheckResult,
  CheckStatus,
  ReadinessReport,
  StorefrontCheck,
  StorefrontSnapshot,
} from "./types";

/** Ordered set of checks with unique ids. */
export class CheckRegistry {
  private readonly checks = new Map<string, StorefrontCheck>();

  constructor(initial: readonly StorefrontCheck[] = []) {
    for (const check of initial) this.register(check);
  }

  register(check: StorefrontCheck): this {
    if (this.checks.has(check.id)) {
      throw new Error(`Duplicate storefront check id: ${check.id}`);
    }
    if (!(check.weight > 0)) {
      throw new Error(`Check ${check.id} needs a positive weight`);
    }
    this.checks.set(check.id, check);
    return this;
  }

  list(): StorefrontCheck[] {
    return [...this.checks.values()];
  }
}

export const defaultRegistry = (): CheckRegistry =>
  new CheckRegistry(DEFAULT_CHECKS);

export function evaluateReadiness(
  snapshot: StorefrontSnapshot,
  checks: readonly StorefrontCheck[] = DEFAULT_CHECKS,
  {
    affectedLimit = READINESS_AFFECTED_LIMIT,
    warnAt = READINESS_WARN_AT,
  }: { affectedLimit?: number; warnAt?: number } = {},
  config: CheckConfig = { channel: null },
): ReadinessReport {
  const results: CheckResult[] = checks.map((check) => {
    const { score, affectedResources } = check.evaluate(snapshot, config);
    const clamped = score === null ? null : Math.min(1, Math.max(0, score));
    const text = check.describe?.(config) ?? {
      name: check.name,
      description: check.description,
    };
    return {
      id: check.id,
      name: text.name,
      description: text.description,
      group: check.group,
      severity: check.severity,
      weight: check.weight,
      status: statusFor(clamped, warnAt),
      score: clamped,
      affectedCount: affectedResources.length,
      affectedResources: affectedResources.slice(0, affectedLimit),
    };
  });

  const applicable = results.filter((r) => r.score !== null);
  const totalWeight = applicable.reduce((sum, r) => sum + r.weight, 0);
  const weighted = applicable.reduce(
    (sum, r) => sum + r.weight * (r.score ?? 0),
    0,
  );

  return {
    score: totalWeight > 0 ? Math.round((100 * weighted) / totalWeight) : null,
    checks: results,
    liveProductCount: liveProducts(snapshot).length,
    productCount: snapshot.products.length,
    productsCapped: snapshot.productsCapped,
    collectionCount: snapshot.collections?.length ?? null,
    collectionsCapped: snapshot.collectionsCapped,
  };
}

export function statusFor(score: number | null, warnAt: number): CheckStatus {
  if (score === null) return "not_applicable";
  if (score >= 1) return "pass";
  return score >= warnAt ? "warn" : "fail";
}
