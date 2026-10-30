/**
 * Metric and score presentation. Small, typed, no business logic: values and
 * tones come from callers / lib/presentation.
 */

import type { ReactNode } from "react";
import type { Tone } from "../../lib/presentation";
import { scoreBand, scoreTone } from "../../lib/presentation";

const BAND_LABEL = {
  good: "Good",
  "needs work": "Needs work",
  poor: "Poor",
} as const;

/** Responsive card grid: 1 column narrow, 2 medium, `columns` wide. */
export function CardGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        gridTemplateColumns={`@container (inline-size > 720px) repeat(${columns}, minmax(0, 1fr)), @container (inline-size > 420px) repeat(2, minmax(0, 1fr)), minmax(0, 1fr)`}
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}

/** Two-column layout that stacks on narrow widths (main | side). */
export function SplitGrid({ children }: { children: ReactNode }) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        gridTemplateColumns="@container (inline-size > 720px) minmax(0, 2fr) minmax(0, 1fr), minmax(0, 1fr)"
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}

/** Card container that matches Admin cards and fills its grid cell. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="base"
      blockSize="100%"
    >
      {children}
    </s-box>
  );
}

export function MetricCard({
  label,
  value,
  tone,
  toneLabel,
  subtext,
  href,
  linkLabel,
  children,
}: {
  label: string;
  value: string;
  /** Optional status badge next to the label (e.g. "Good"). */
  tone?: Tone;
  toneLabel?: string;
  subtext?: string;
  href?: string;
  linkLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <s-stack gap="small-200">
        <s-stack
          direction="inline"
          gap="small-200"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text color="subdued">{label}</s-text>
          {tone && toneLabel && <s-badge tone={tone}>{toneLabel}</s-badge>}
        </s-stack>
        <s-heading>{value}</s-heading>
        {subtext && <s-text color="subdued">{subtext}</s-text>}
        {children}
        {href && linkLabel && <s-link href={href}>{linkLabel}</s-link>}
      </s-stack>
    </Card>
  );
}

/** Accessible label like "82 out of 100, good". */
export function scoreLabel(score: number): string {
  return `${score} out of 100, ${scoreBand(score)}`;
}

/**
 * Score with tone and progress bar. `hero` for page-level scores, `compact`
 * for table cells.
 */
export function ScoreIndicator({
  score,
  label = "Health score",
  size = "hero",
}: {
  score: number | null;
  label?: string;
  size?: "hero" | "compact";
}) {
  if (score === null) {
    return <s-text color="subdued">Not enough data yet</s-text>;
  }
  const tone = scoreTone(score);
  const band = BAND_LABEL[scoreBand(score)];

  if (size === "compact") {
    return (
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge tone={tone}>{`${score}`}</s-badge>
        <s-box inlineSize="64px">
          <s-progress
            value={score}
            max={100}
            tone={tone}
            accessibilityLabel={scoreLabel(score)}
          />
        </s-box>
      </s-stack>
    );
  }

  return (
    <s-stack gap="small-200">
      <s-text color="subdued">{label}</s-text>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-heading>{`${score} / 100`}</s-heading>
        <s-badge tone={tone}>{band}</s-badge>
      </s-stack>
      <s-progress
        value={score}
        max={100}
        tone={tone}
        accessibilityLabel={scoreLabel(score)}
      />
    </s-stack>
  );
}

/** Labelled progress bar: "Content  24 / 30". */
export function LabeledProgress({
  label,
  value,
  max,
  tone,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  tone: Tone;
  valueText?: string;
}) {
  const text = valueText ?? `${value} / ${max}`;
  return (
    <s-stack gap="small-300">
      <s-stack
        direction="inline"
        justifyContent="space-between"
        gap="small-200"
      >
        <s-text>{label}</s-text>
        <s-text color="subdued">{text}</s-text>
      </s-stack>
      <s-progress
        value={value}
        max={max}
        tone={tone}
        accessibilityLabel={`${label}: ${text}`}
      />
    </s-stack>
  );
}

/**
 * Proportion breakdown. Polaris has no stacked bar, so each segment gets its
 * own labelled bar (same information, accessible, no custom colors).
 */
export function ProportionBars({
  segments,
  total,
}: {
  segments: Array<{ key: string; label: string; value: number; tone: Tone }>;
  total: number;
}) {
  return (
    <s-stack gap="small-200">
      {segments.map((s) => (
        <LabeledProgress
          key={s.key}
          label={s.label}
          value={s.value}
          max={Math.max(total, 1)}
          tone={s.tone}
          valueText={`${s.value.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}
        />
      ))}
    </s-stack>
  );
}
