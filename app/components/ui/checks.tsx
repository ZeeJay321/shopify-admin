/** Check rows and ranked issue lists. Icons always come with text. */

import type { ReactNode } from "react";
import type { CheckStatus } from "../../lib/product-health/types";
import { CHECK_STATUS_LABELS, checkStatusTone } from "../../lib/presentation";

type Status = CheckStatus | "not_applicable";

const ICONS = {
  pass: "check-circle-filled",
  warn: "alert-triangle",
  fail: "x-circle",
  not_applicable: "minus-circle",
} as const;

export function CheckIcon({ status }: { status: Status }) {
  const tone = checkStatusTone(status);
  return (
    <s-icon
      type={ICONS[status]}
      tone={
        tone === "neutral"
          ? "neutral"
          : tone === "success"
            ? "success"
            : tone === "warning"
              ? "warning"
              : "critical"
      }
    />
  );
}

/**
 * One check: icon + label + status text (+ badge when not passing), the
 * message, an optional subdued fix step and an optional inline action.
 */
export function CheckRow({
  status,
  label,
  message,
  fix,
  meta,
  action,
  children,
}: {
  status: Status;
  label: string;
  message?: string;
  fix?: string;
  /** Extra inline badges, e.g. severity or affected count. */
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const passing = status === "pass" || status === "not_applicable";
  return (
    <s-stack gap="small-300">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <CheckIcon status={status} />
        <s-text type="strong">{label}</s-text>
        {passing ? (
          <s-text accessibilityVisibility="exclusive">
            {CHECK_STATUS_LABELS[status]}
          </s-text>
        ) : (
          <s-badge tone={checkStatusTone(status)}>
            {CHECK_STATUS_LABELS[status]}
          </s-badge>
        )}
        {meta}
      </s-stack>
      {message && <s-text color="subdued">{message}</s-text>}
      {fix && (
        <s-box padding="small-200" background="subdued" borderRadius="base">
          <s-text color="subdued">
            <s-text type="strong">How to fix: </s-text>
            {fix}
          </s-text>
        </s-box>
      )}
      {action && <s-stack direction="inline">{action}</s-stack>}
      {children}
    </s-stack>
  );
}

/** Ranked list: "1. Label  [12]" with optional links. */
export function IssueList({
  items,
}: {
  items: Array<{ key: string; label: string; count: number; href?: string }>;
}) {
  return (
    <s-stack gap="small-200">
      {items.map((item, i) => (
        <s-stack
          key={item.key}
          direction="inline"
          gap="small-200"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text color="subdued">{`${i + 1}.`}</s-text>
            {item.href ? (
              <s-link href={item.href}>{item.label}</s-link>
            ) : (
              <s-text>{item.label}</s-text>
            )}
          </s-stack>
          <s-badge>{`${item.count.toLocaleString("en-US")} product${item.count === 1 ? "" : "s"}`}</s-badge>
        </s-stack>
      ))}
    </s-stack>
  );
}
