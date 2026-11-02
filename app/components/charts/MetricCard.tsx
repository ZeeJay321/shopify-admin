import type { ReactNode } from "react";
import type { Tone } from "../../lib/presentation";
import { Card } from "../ui/metrics";
import { toneColor } from "./palette";
import { Sparkline } from "./Sparkline";

/** Big number, subdued label, tone accent, optional trend and link. */
export function MetricCard({
  label,
  value,
  tone = "neutral",
  toneLabel,
  subtext,
  href,
  linkLabel,
  trend,
  trendLabel,
  children,
}: {
  label: string;
  value: string;
  /** Accent stripe (and badge, with toneLabel). */
  tone?: Tone;
  toneLabel?: string;
  subtext?: string;
  href?: string;
  linkLabel?: string;
  /** Real per-period values only (never invented history). */
  trend?: readonly number[];
  /** Says what the trend covers, e.g. "Orders per day, last 14 days". */
  trendLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <s-stack gap="small-200">
        <span
          className="zj-accent"
          style={{ background: toneColor(tone) }}
          aria-hidden="true"
        />
        <s-stack
          direction="inline"
          gap="small-200"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text color="subdued">{label}</s-text>
          {toneLabel && <s-badge tone={tone}>{toneLabel}</s-badge>}
        </s-stack>
        <span className="zj-figure">{value}</span>
        {trend && trend.length > 1 && (
          <s-stack gap="small-300">
            <Sparkline values={trend} />
            {trendLabel && <s-text color="subdued">{trendLabel}</s-text>}
          </s-stack>
        )}
        {subtext && <s-text color="subdued">{subtext}</s-text>}
        {children}
        {href && linkLabel && <s-link href={href}>{linkLabel}</s-link>}
      </s-stack>
    </Card>
  );
}
