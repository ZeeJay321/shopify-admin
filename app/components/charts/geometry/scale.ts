/** Linear scales and "nice" axis ticks (pure). */

export type Scale = (value: number) => number;

export function linearScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): Scale {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** Smallest 1 / 2 / 2.5 / 5 × 10^k step >= raw (integer counts: >= 1). */
export function niceStep(raw: number, integer = true): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ??
    10 * power;
  return integer ? Math.max(1, Math.ceil(step)) : step;
}

/** Axis ticks from 0 up to a nice top that covers `max`. */
export function ticks(max: number, count = 4, integer = true): number[] {
  if (!(max > 0)) return [0, 1];
  const step = niceStep(max / count, integer);
  const top = Math.ceil(max / step) * step;
  const result: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) result.push(v);
  return result;
}

/** Show every k-th category label so at most `maxLabels` are drawn. */
export function labelStride(count: number, maxLabels: number): number {
  if (count <= 0 || maxLabels <= 0) return 1;
  return Math.max(1, Math.ceil(count / maxLabels));
}
