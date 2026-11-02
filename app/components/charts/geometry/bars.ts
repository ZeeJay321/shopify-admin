/** Band layout for column charts and bar lengths (pure). */

export type Band = { x: number; band: number; bar: number; barX: number };

/**
 * `count` equal bands across `width`; each bar is centred in its band, at
 * most `maxBar` wide and never wider than the band minus `gap`.
 */
export function bandLayout(
  count: number,
  width: number,
  { gap = 2, maxBar = 24 }: { gap?: number; maxBar?: number } = {},
): Band[] {
  if (count <= 0 || width <= 0) return [];
  const band = width / count;
  const bar = Math.max(1, Math.min(maxBar, band - gap));
  return Array.from({ length: count }, (_, i) => {
    const x = i * band;
    return { x, band, bar, barX: x + (band - bar) / 2 };
  });
}

/** Bar length for `value` on a 0..max axis of `length` (clamped). */
export function barLength(value: number, max: number, length: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(length, (value / max) * length);
}

/**
 * Column with rounded top corners and a square baseline. `y` is the top,
 * `h` the height; the radius shrinks to fit short or thin columns.
 */
export function columnPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 4,
): string {
  if (!(w > 0) || !(h > 0)) return "";
  const r = Math.min(radius, w / 2, h);
  const n = (v: number) => Math.round(v * 100) / 100;
  return [
    `M ${n(x)} ${n(y + h)}`,
    `L ${n(x)} ${n(y + r)}`,
    `Q ${n(x)} ${n(y)} ${n(x + r)} ${n(y)}`,
    `L ${n(x + w - r)} ${n(y)}`,
    `Q ${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}`,
    `L ${n(x + w)} ${n(y + h)}`,
    "Z",
  ].join(" ");
}
