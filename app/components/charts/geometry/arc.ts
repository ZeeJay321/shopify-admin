/**
 * Arc geometry for gauges and donuts (pure). Angles are degrees, 0 at
 * 12 o'clock, increasing clockwise.
 */

export type Point = { x: number; y: number };

export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angle: number,
): Point {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

/** Stroke path for an arc; a full circle is drawn as two half arcs. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  if (sweep <= 0) return "";
  if (sweep >= 360) {
    return `${arcPath(cx, cy, r, 0, 180)} ${arcPath(cx, cy, r, 180, 360)}`;
  }
  const a = polarToCartesian(cx, cy, r, start);
  const b = polarToCartesian(cx, cy, r, end);
  const large = sweep > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Semicircle gauge: the track and the value arc for a 0-100 score. */
export function gaugeAngles(score: number): {
  track: [number, number];
  value: [number, number];
} {
  const clamped = Math.min(
    100,
    Math.max(0, Number.isFinite(score) ? score : 0),
  );
  return { track: [-90, 90], value: [-90, -90 + (clamped / 100) * 180] };
}

export type DonutSegment = {
  index: number;
  value: number;
  fraction: number;
  start: number;
  end: number;
};

/**
 * Ring segments for non-zero values, in input order. `gap` degrees are
 * taken out between neighbours (never from a lone full-circle segment);
 * each visible segment keeps at least `minSweep` degrees.
 */
export function donutSegments(
  values: readonly number[],
  { gap = 0, minSweep = 0 }: { gap?: number; minSweep?: number } = {},
): DonutSegment[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return [];
  const nonZero = values
    .map((value, index) => ({ value: Math.max(0, value), index }))
    .filter((v) => v.value > 0);
  if (nonZero.length === 1) {
    const [only] = nonZero;
    return [
      { index: only.index, value: only.value, fraction: 1, start: 0, end: 360 },
    ];
  }
  const available = 360 - gap * nonZero.length;
  // Give tiny segments their minimum first, share the rest proportionally.
  const small = nonZero.filter((v) => (v.value / total) * available < minSweep);
  const bigTotal = nonZero
    .filter((v) => !small.includes(v))
    .reduce((s, v) => s + v.value, 0);
  const shared = available - small.length * minSweep;

  let cursor = 0;
  return nonZero.map((v) => {
    const sweep = small.includes(v)
      ? minSweep
      : bigTotal > 0
        ? (v.value / bigTotal) * shared
        : 0;
    const start = cursor + gap / 2;
    cursor += sweep + gap;
    return {
      index: v.index,
      value: v.value,
      fraction: v.value / total,
      start: round(start),
      end: round(start + sweep),
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
