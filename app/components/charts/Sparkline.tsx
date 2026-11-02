import type { Tone } from "../../lib/presentation";
import { areaPath, linePath, sparklinePoints } from "./geometry";
import { ACCENT, toneColor } from "./palette";

const VIEW_WIDTH = 120;

/**
 * Tiny trend line for metric cards. Decorative: the card's text states
 * what it shows, so it's hidden from assistive tech.
 */
export function Sparkline({
  values,
  tone,
  height = 32,
}: {
  values: readonly number[];
  tone?: Tone;
  height?: number;
}) {
  if (values.length < 2) return null;
  const color = tone ? toneColor(tone) : ACCENT;
  const points = sparklinePoints(values, VIEW_WIDTH, height, 2);
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", inlineSize: "100%", blockSize: height }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={areaPath(points, height)} fill={color} fillOpacity={0.12} />
      <path
        d={linePath(points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
