/** Score distribution buckets for the Store Health histogram (pure). */

export type ScoreBucket = { min: number; max: number; label: string };

/** Five fixed bands; the last one is closed at 100. */
export const SCORE_BUCKETS: readonly ScoreBucket[] = [
  { min: 0, max: 19, label: "0–19" },
  { min: 20, max: 39, label: "20–39" },
  { min: 40, max: 59, label: "40–59" },
  { min: 60, max: 79, label: "60–79" },
  { min: 80, max: 100, label: "80–100" },
];

/** Count of scores per SCORE_BUCKETS entry (out-of-range values clamp). */
export function bucketScores(scores: readonly number[]): number[] {
  const counts = SCORE_BUCKETS.map(() => 0);
  for (const raw of scores) {
    if (!Number.isFinite(raw)) continue;
    const score = Math.min(100, Math.max(0, Math.round(raw)));
    const index = SCORE_BUCKETS.findIndex(
      (b) => score >= b.min && score <= b.max,
    );
    counts[index]++;
  }
  return counts;
}
