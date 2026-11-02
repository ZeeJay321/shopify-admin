import { describe, expect, it } from "vitest";
import { dayKey, ordersPerDay, shiftDay } from "./daily";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("dayKey", () => {
  it("uses the shop timezone", () => {
    expect(dayKey("2026-10-29T20:00:00Z", "Asia/Karachi")).toBe("2026-10-30");
    expect(dayKey("2026-10-29T20:00:00Z", "UTC")).toBe("2026-10-29");
  });

  it("falls back to UTC for unknown zones and rejects bad dates", () => {
    expect(dayKey("2026-10-29T20:00:00Z", "Not/AZone")).toBe("2026-10-29");
    expect(dayKey("nope", "UTC")).toBeNull();
  });
});

describe("shiftDay", () => {
  it("crosses month and DST boundaries by calendar day", () => {
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-03-08", 1)).toBe("2026-03-09");
  });
});

describe("ordersPerDay", () => {
  it("groups by shop day and fills zero days", () => {
    const result = ordersPerDay(
      ["2026-10-30T01:00:00Z", "2026-10-29T20:00:00Z", "2026-10-28T10:00:00Z"],
      { now: NOW, timeZone: "Asia/Karachi", days: 3 },
    );
    expect(result).toEqual([
      { date: "2026-10-28", count: 1 },
      { date: "2026-10-29", count: 0 },
      { date: "2026-10-30", count: 2 },
    ]);
  });

  it("drops days before the covered range of a capped sample", () => {
    const result = ordersPerDay(["2026-10-30T01:00:00Z"], {
      now: NOW,
      timeZone: "UTC",
      days: 7,
      coveredFrom: "2026-10-29T08:00:00Z",
    });
    expect(result.map((d) => d.date)).toEqual(["2026-10-29", "2026-10-30"]);
  });

  it("ignores orders outside the window and handles empty input", () => {
    expect(
      ordersPerDay(["2026-09-01T00:00:00Z"], {
        now: NOW,
        timeZone: "UTC",
        days: 2,
      }),
    ).toEqual([
      { date: "2026-10-29", count: 0 },
      { date: "2026-10-30", count: 0 },
    ]);
    expect(ordersPerDay([], { now: NOW, timeZone: "UTC", days: 0 })).toEqual(
      [],
    );
  });
});
