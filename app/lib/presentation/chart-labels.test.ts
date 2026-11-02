import { describe, expect, it } from "vitest";
import { scoreVerdict } from "./tones";
import { formatDay, formatDayLong } from "./format";

describe("scoreVerdict", () => {
  it("follows the score bands", () => {
    expect(scoreVerdict(80)).toBe("Good");
    expect(scoreVerdict(79)).toBe("Needs work");
    expect(scoreVerdict(50)).toBe("Needs work");
    expect(scoreVerdict(49)).toBe("Poor");
  });
});

describe("formatDay", () => {
  it("formats calendar day keys without shifting the day", () => {
    expect(formatDay("2026-10-30")).toBe("Oct 30");
    expect(formatDayLong("2026-10-30")).toBe("Fri, Oct 30");
    expect(formatDay("bad")).toBe("bad");
  });
});
