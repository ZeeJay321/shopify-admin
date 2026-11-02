import type { Tone } from "../../lib/presentation";
import { formatNumber } from "../../lib/presentation";
import {
  bandLayout,
  columnPath,
  labelStride,
  linearScale,
  ticks,
} from "./geometry";
import { useActiveIndex, useElementWidth } from "./interaction";
import { ACCENT, INK, toneColor } from "./palette";
import { ChartEmpty, DataTable, Tooltip } from "./parts";

export type Column = {
  key: string;
  /** Axis label (short). */
  label: string;
  value: number;
  /** Tooltip / table label (long); defaults to `label`. */
  detail?: string;
};

const MARGIN = { top: 20, right: 4, bottom: 24, left: 32 };

/**
 * Vertical bars on one count axis, sized to the rendered width so text
 * stays legible. Hover or arrow keys show a tooltip; the peak is labelled.
 */
export function ColumnChart({
  data,
  label,
  valueLabel,
  tone,
  height = 200,
  formatValue = formatNumber,
  emptyMessage = "Not enough data yet.",
  emptyAction,
}: {
  data: readonly Column[];
  label: string;
  /** Column header / unit, e.g. "Orders". */
  valueLabel: string;
  tone?: Tone;
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  emptyAction?: { label: string; href: string };
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(480);
  const { active, setActive, containerProps } = useActiveIndex(data.length);
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (data.length === 0 || total === 0) {
    return <ChartEmpty message={emptyMessage} action={emptyAction} />;
  }

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const values = data.map((d) => Math.max(0, d.value));
  const peak = Math.max(...values);
  const yTicks = ticks(peak, 4);
  const y = linearScale([0, yTicks[yTicks.length - 1]], [plotH, 0]);
  const bands = bandLayout(data.length, plotW, { gap: 4, maxBar: 24 });
  const stride = labelStride(data.length, Math.max(2, Math.floor(plotW / 52)));
  const peakIndex = values.indexOf(peak);
  const fill = tone ? toneColor(tone) : ACCENT;

  const summary = `${label}. ${data.length} bars, total ${formatValue(total)}, peak ${formatValue(peak)} on ${data[peakIndex].detail ?? data[peakIndex].label}.`;
  const tip =
    active === null
      ? null
      : {
          x: Math.min(
            width - 56,
            Math.max(
              56,
              MARGIN.left + bands[active].x + bands[active].band / 2,
            ),
          ),
          y: MARGIN.top + y(values[active]),
          text: `${data[active].detail ?? data[active].label}: ${formatValue(values[active])}`,
        };

  return (
    <s-stack gap="small-200">
      <div
        ref={ref}
        className="zj-chart"
        role="img"
        aria-label={summary}
        {...containerProps}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ blockSize: height }}
          aria-hidden="true"
          focusable="false"
        >
          <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={0}
                  x2={plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? INK.axis : INK.grid}
                  strokeWidth={1}
                />
                <text
                  x={-6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const band = bands[i];
              const top = y(values[i]);
              return (
                <g key={d.key} onMouseEnter={() => setActive(i)}>
                  <rect
                    x={band.x}
                    y={0}
                    width={band.band}
                    height={plotH}
                    fill={active === i ? INK.track : "transparent"}
                    opacity={0.6}
                  />
                  <path
                    d={columnPath(band.barX, top, band.bar, plotH - top)}
                    fill={fill}
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                  {i % stride === 0 && (
                    <text
                      x={band.x + band.band / 2}
                      y={plotH + 16}
                      textAnchor="middle"
                    >
                      {d.label}
                    </text>
                  )}
                  {active === null && i === peakIndex && (
                    <text
                      x={band.x + band.band / 2}
                      y={top - 6}
                      textAnchor="middle"
                      className="zj-text-strong"
                    >
                      {formatValue(values[i])}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {tip && (
          <Tooltip x={tip.x} y={tip.y}>
            {tip.text}
          </Tooltip>
        )}
      </div>
      <DataTable
        caption={label}
        columns={["", valueLabel]}
        rows={data.map((d, i) => ({
          key: d.key,
          label: d.detail ?? d.label,
          value: formatValue(values[i]),
        }))}
      />
    </s-stack>
  );
}
