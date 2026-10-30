import type { CheckStatus } from "../lib/product-health/types";
import { scoreTone } from "../lib/product-health";
import type { MerchantError } from "../lib/shopify/errors";

export function ScoreBadge({ score }: { score: number }) {
  return <s-badge tone={scoreTone(score)}>{score} / 100</s-badge>;
}

const STATUS_TONE: Record<string, "success" | "info" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "info",
  ARCHIVED: "neutral",
};

export function ProductStatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <s-badge tone={STATUS_TONE[status] ?? "neutral"}>{label}</s-badge>;
}

const CHECK_ICON = {
  pass: { type: "check-circle-filled", tone: "success", label: "Pass" },
  warn: { type: "alert-triangle", tone: "warning", label: "Warning" },
  fail: { type: "x-circle", tone: "critical", label: "Fail" },
} as const;

export function CheckStatusIcon({ status }: { status: CheckStatus }) {
  const icon = CHECK_ICON[status];
  return (
    <s-box accessibilityLabel={icon.label}>
      <s-icon type={icon.type} tone={icon.tone} />
    </s-box>
  );
}

export function ErrorBanner({ error }: { error: MerchantError }) {
  return (
    <s-banner
      tone={error.kind === "throttled" ? "warning" : "critical"}
      heading={error.title}
    >
      {error.message}
    </s-banner>
  );
}

export function formatCount(count: number, atLeast: boolean): string {
  return `${count.toLocaleString("en-US")}${atLeast ? "+" : ""}`;
}
