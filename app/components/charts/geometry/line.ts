/** Sparkline paths (pure). */

import type { Point } from "./arc";

/** Points spread across width, 0 at the bottom, max at `pad` from the top. */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad = 2,
): Point[] {
  if (values.length === 0) return [];
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: round(values.length > 1 ? pad + i * step : width / 2),
    y: round(height - pad - ((v - min) / span) * (height - pad * 2)),
  }));
}

export function linePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** Closed area under the line down to `baseline`. */
export function areaPath(points: readonly Point[], baseline: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
