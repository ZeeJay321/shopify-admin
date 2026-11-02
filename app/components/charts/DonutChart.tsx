import { formatNumber } from "../../lib/presentation";
import { arcPath, donutSegments, toPercentages } from "./geometry";
import { useActiveIndex } from "./interaction";
import { INK, toneColor } from "./palette";
import type { Segment } from "./parts";
import { ChartEmpty, Legend } from "./parts";

/**
 * Ring of segments with the total in the middle and a legend (counts and
 * shares). Hover or arrow keys show one segment's numbers in the center.
 */
export function DonutChart({
  segments,
  label,
  totalLabel,
  emptyMessage = "Nothing to show yet.",
  emptyAction,
}: {
  segments: readonly Segment[];
  label: string;
  /** Noun under the center total, e.g. "variants". */
  totalLabel: string;
  emptyMessage?: string;
  emptyAction?: { label: string; href: string };
}) {
  const arcs = donutSegments(
    segments.map((s) => s.value),
    { gap: 3, minSweep: 4 },
  );
  const { active, setActive, containerProps } = useActiveIndex(arcs.length);
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total === 0) {
    return (
      <ChartEmpty
        icon="chart-donut"
        message={emptyMessage}
        action={emptyAction}
      />
    );
  }

  const percents = toPercentages(segments.map((s) => s.value));
  const summary = `${label}: ${segments
    .map((s, i) => `${s.label} ${formatNumber(s.value)} (${percents[i]}%)`)
    .join(", ")}. Total ${formatNumber(total)} ${totalLabel}.`;
  const focused = active === null ? null : arcs[active];
  const focusedSegment = focused ? segments[focused.index] : null;

  return (
    <s-query-container>
      <s-grid
        gap="base"
        alignItems="center"
        gridTemplateColumns="@container (inline-size > 400px) minmax(0, 180px) minmax(0, 1fr), minmax(0, 1fr)"
      >
        <div
          className="zj-chart"
          style={{ maxInlineSize: 180, marginInline: "auto" }}
          role="img"
          aria-label={summary}
          {...containerProps}
        >
          <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
            {arcs.map((arc, i) => (
              <path
                key={segments[arc.index].key}
                d={arcPath(80, 80, 62, arc.start, arc.end)}
                fill="none"
                stroke={toneColor(segments[arc.index].tone)}
                strokeWidth={active === i ? 24 : 20}
                opacity={active === null || active === i ? 1 : 0.35}
                onMouseEnter={() => setActive(i)}
              />
            ))}
            <text
              x={80}
              y={80}
              textAnchor="middle"
              className="zj-text-strong"
              style={{ fontSize: 26 }}
            >
              {formatNumber(focused ? focused.value : total)}
            </text>
            <text
              x={80}
              y={100}
              textAnchor="middle"
              style={{ fontSize: 11, fill: INK.secondary }}
            >
              {focusedSegment
                ? `${focusedSegment.label} · ${percents[focused?.index ?? 0]}%`
                : totalLabel}
            </text>
          </svg>
        </div>
        <Legend items={segments} layout="column" />
      </s-grid>
    </s-query-container>
  );
}
