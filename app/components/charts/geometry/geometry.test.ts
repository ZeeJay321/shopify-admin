import { describe, expect, it } from "vitest";
import {
  arcPath,
  areaPath,
  bandLayout,
  barLength,
  columnPath,
  donutSegments,
  gaugeAngles,
  labelStride,
  linePath,
  linearScale,
  niceStep,
  polarToCartesian,
  sparklinePoints,
  stackSegments,
  ticks,
  toPercentages,
} from ".";

describe("scale", () => {
  it("maps domain to range, including inverted ranges", () => {
    const y = linearScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(linearScale([3, 3], [0, 10])(3)).toBe(0);
  });

  it("picks nice integer steps and ticks", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(18)).toBe(20);
    expect(niceStep(0.3, false)).toBeCloseTo(0.5);
    expect(ticks(7, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(ticks(100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(ticks(0)).toEqual([0, 1]);
  });

  it("thins labels", () => {
    expect(labelStride(14, 7)).toBe(2);
    expect(labelStride(5, 7)).toBe(1);
    expect(labelStride(0, 7)).toBe(1);
  });
});

describe("arc", () => {
  it("puts 0 degrees at 12 o'clock, clockwise", () => {
    expect(polarToCartesian(50, 50, 10, 0)).toEqual({ x: 50, y: 40 });
    expect(polarToCartesian(50, 50, 10, 90)).toEqual({ x: 60, y: 50 });
  });

  it("draws arcs, full circles as two halves, nothing for empty sweeps", () => {
    expect(arcPath(50, 50, 10, -90, 90)).toBe("M 40 50 A 10 10 0 0 1 60 50");
    expect(arcPath(50, 50, 10, 0, 270)).toContain(" 0 1 1 ");
    expect(arcPath(50, 50, 10, 0, 360).match(/A /g)).toHaveLength(2);
    expect(arcPath(50, 50, 10, 10, 10)).toBe("");
  });

  it("maps gauge scores onto a clamped semicircle", () => {
    expect(gaugeAngles(0).value).toEqual([-90, -90]);
    expect(gaugeAngles(50).value).toEqual([-90, 0]);
    expect(gaugeAngles(150).value).toEqual([-90, 90]);
    expect(gaugeAngles(Number.NaN).value).toEqual([-90, -90]);
  });

  it("splits a donut, skipping zeros and leaving gaps", () => {
    const segs = donutSegments([1, 0, 1], { gap: 4 });
    expect(segs.map((s) => s.index)).toEqual([0, 2]);
    expect(segs[0]).toMatchObject({ start: 2, end: 178, fraction: 0.5 });
    expect(segs[1]).toMatchObject({ start: 182, end: 358 });
  });

  it("handles zero totals, a single segment and tiny segments", () => {
    expect(donutSegments([0, 0])).toEqual([]);
    expect(donutSegments([0, 5], { gap: 4 })).toEqual([
      { index: 1, value: 5, fraction: 1, start: 0, end: 360 },
    ]);
    const segs = donutSegments([1000, 1], { minSweep: 6 });
    expect(segs[1].end - segs[1].start).toBeCloseTo(6);
    expect(segs[0].end - segs[0].start).toBeCloseTo(354);
  });
});

describe("proportions", () => {
  it("returns whole percentages that sum to 100", () => {
    expect(toPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(toPercentages([2, 1, 0])).toEqual([67, 33, 0]);
    expect(toPercentages([0, 0])).toEqual([0, 0]);
    expect(toPercentages([-3, Number.NaN, 5])).toEqual([0, 0, 100]);
  });

  it("stacks segments from 0 to 1", () => {
    expect(stackSegments([1, 3])).toEqual([
      { offset: 0, width: 0.25 },
      { offset: 0.25, width: 0.75 },
    ]);
    expect(stackSegments([0, 0])).toEqual([
      { offset: 0, width: 0 },
      { offset: 0, width: 0 },
    ]);
  });
});

describe("bars", () => {
  it("centres capped bars in equal bands", () => {
    const [first, second] = bandLayout(2, 100);
    expect(first).toEqual({ x: 0, band: 50, bar: 24, barX: 13 });
    expect(second.barX).toBe(63);
    expect(bandLayout(10, 50, { gap: 2 })[0].bar).toBe(3);
    expect(bandLayout(0, 100)).toEqual([]);
  });

  it("rounds only the top of a column and fits the radius", () => {
    expect(columnPath(0, 10, 10, 20)).toBe(
      "M 0 30 L 0 14 Q 0 10 4 10 L 6 10 Q 10 10 10 14 L 10 30 Z",
    );
    expect(columnPath(0, 0, 4, 1)).toContain("Q 0 0 1 0");
    expect(columnPath(0, 0, 10, 0)).toBe("");
  });

  it("scales and clamps bar lengths", () => {
    expect(barLength(5, 10, 200)).toBe(100);
    expect(barLength(20, 10, 200)).toBe(200);
    expect(barLength(5, 0, 200)).toBe(0);
    expect(barLength(-1, 10, 200)).toBe(0);
  });
});

describe("line", () => {
  it("spreads points and builds line and area paths", () => {
    const pts = sparklinePoints([0, 10], 100, 20, 0);
    expect(pts).toEqual([
      { x: 0, y: 20 },
      { x: 100, y: 0 },
    ]);
    expect(linePath(pts)).toBe("M 0 20 L 100 0");
    expect(areaPath(pts, 20)).toBe("M 0 20 L 100 0 L 100 20 L 0 20 Z");
  });

  it("handles empty, single and flat series", () => {
    expect(sparklinePoints([], 100, 20)).toEqual([]);
    expect(sparklinePoints([3], 100, 20, 0)).toEqual([{ x: 50, y: 0 }]);
    expect(areaPath(sparklinePoints([3], 100, 20), 20)).toBe("");
    expect(sparklinePoints([0, 0], 100, 20, 0).map((p) => p.y)).toEqual([
      20, 20,
    ]);
  });
});
