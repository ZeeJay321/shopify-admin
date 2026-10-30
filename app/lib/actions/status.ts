/**
 * Product status change planning. Only DRAFT <-> ACTIVE. Activating a product
 * with failing critical health checks (no image, a zero/missing price, no
 * description) needs an extra acknowledgement.
 */

import type { HealthCheck } from "../product-health/types";
import type { ActionPlan, BeforeAfter, FieldError } from "./types";

export type EditableStatus = "ACTIVE" | "DRAFT";

export const STATUS_TRANSITIONS: Readonly<
  Record<EditableStatus, EditableStatus>
> = {
  DRAFT: "ACTIVE",
  ACTIVE: "DRAFT",
};

export function isEditableStatus(value: string): value is EditableStatus {
  return value === "ACTIVE" || value === "DRAFT";
}

/** Phase 1 checks that make a product unfit to sell. */
export function criticalIssues(checks: readonly HealthCheck[]): string[] {
  const issues: string[] = [];
  for (const check of checks) {
    if (check.id === "images" && check.status === "fail") {
      issues.push("It has no images.");
    } else if (check.id === "variant_prices" && check.status !== "pass") {
      issues.push("At least one variant has no price or a price of 0.");
    } else if (check.id === "description" && check.status === "fail") {
      issues.push("It has no description.");
    }
  }
  return issues;
}

export function planStatusChange({
  current,
  next,
  checks,
}: {
  current: string;
  next: string;
  checks: readonly HealthCheck[];
}): ActionPlan<BeforeAfter<string>> {
  const errors: FieldError[] = [];
  let warnings: string[] = [];

  if (!isEditableStatus(current)) {
    errors.push({
      field: "status",
      message: `This product is ${current.toLowerCase()}. Change it in Shopify Admin first.`,
    });
  } else if (!isEditableStatus(next) || STATUS_TRANSITIONS[current] !== next) {
    errors.push({
      field: "status",
      message:
        current === next
          ? `This product is already ${current.toLowerCase()}.`
          : "That status change isn't supported here.",
    });
  } else if (next === "ACTIVE") {
    warnings = criticalIssues(checks);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { before: current, after: next },
    requiresExtraConfirmation: errors.length === 0 && warnings.length > 0,
  };
}
