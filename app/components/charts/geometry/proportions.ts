/** Shares of a total (pure). */

/**
 * Whole percentages that always add up to 100 (largest remainder), so a
 * legend never reads 33% + 33% + 33%. All zeros for a zero total.
 */
export function toPercentages(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total === 0) return clean.map(() => 0);
  const exact = clean.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i]++;
    remaining--;
  }
  return floors;
}

/** Start offset and width (0..1) of each segment in a single stacked bar. */
export function stackSegments(
  values: readonly number[],
): Array<{ offset: number; width: number }> {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  let offset = 0;
  return clean.map((v) => {
    const width = total > 0 ? v / total : 0;
    const segment = { offset, width };
    offset += width;
    return segment;
  });
}
