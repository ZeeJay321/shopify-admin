/** Badges with tones/labels from lib/presentation (never raw enum values). */

import type { RiskLevel } from "../../lib/inventory-risk/types";
import type { OrderSeverity } from "../../lib/order-ops/types";
import {
  RISK_LABELS,
  RISK_TONES,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  enumLabel,
  statusTone,
} from "../../lib/presentation";

/** Product, payment or fulfillment status ("ACTIVE" -> "Active"). */
export function StatusBadge({ status }: { status: string | null }) {
  return <s-badge tone={statusTone(status)}>{enumLabel(status)}</s-badge>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <s-badge tone={RISK_TONES[risk]}>{RISK_LABELS[risk]}</s-badge>;
}

export function SeverityBadge({ severity }: { severity: OrderSeverity }) {
  return (
    <s-badge
      tone={SEVERITY_TONES[severity]}
    >{`${SEVERITY_LABELS[severity]} severity`}</s-badge>
  );
}

/** Neutral count badge, e.g. issue counts in tables. */
export function CountBadge({ count, noun }: { count: number; noun: string }) {
  return (
    <s-badge tone={count > 0 ? "warning" : "success"}>
      {count === 0
        ? `No ${noun}s`
        : `${count} ${noun}${count === 1 ? "" : "s"}`}
    </s-badge>
  );
}
