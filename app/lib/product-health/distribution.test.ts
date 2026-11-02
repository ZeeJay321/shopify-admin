import { describe, expect, it } from "vitest";
import { SCORE_BUCKETS, bucketScores } from "./distribution";

describe("bucketScores", () => {
  it("counts scores into the five bands, inclusive at both edges", () => {
    expect(bucketScores([0, 19, 20, 39, 40, 59, 60, 79, 80, 100])).toEqual([
      2, 2, 2, 2, 2,
    ]);
  });

  it("returns zeros for no scores", () => {
    expect(bucketScores([])).toEqual(SCORE_BUCKETS.map(() => 0));
  });

  it("clamps out-of-range values and ignores non-finite ones", () => {
    expect(bucketScores([-5, 120, Number.NaN, 79.6])).toEqual([1, 0, 0, 0, 2]);
  });
});
