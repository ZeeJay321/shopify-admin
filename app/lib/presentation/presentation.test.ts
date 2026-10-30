import { describe, expect, it } from "vitest";
import {
  RISK_TONES,
  SEVERITY_TONES,
  checkSeverityTone,
  checkStatusTone,
  scoreBand,
  scoreTone,
  statusTone,
} from "./tones";
import {
  CHECK_STATUS_LABELS,
  REASON_LABELS,
  RISK_LABELS,
  enumLabel,
  plural,
} from "./labels";
import {
  formatCount,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  ratio,
} from "./format";
import { nextBestAction, readinessVerdict } from "./next-action";

describe("tones", () => {
  it.each([
    [100, "success", "good"],
    [80, "success", "good"],
    [79, "warning", "needs work"],
    [50, "warning", "needs work"],
    [49, "critical", "poor"],
    [0, "critical", "poor"],
  ] as const)("score %i -> %s / %s", (score, tone, band) => {
    expect(scoreTone(score)).toBe(tone);
    expect(scoreBand(score)).toBe(band);
  });

  it("maps severity, risk and check status once", () => {
    expect(SEVERITY_TONES).toEqual({
      HIGH: "critical",
      MEDIUM: "warning",
      LOW: "info",
    });
    expect(RISK_TONES.critical).toBe("critical");
    expect(RISK_TONES.untracked).toBe("neutral");
    expect(checkStatusTone("pass")).toBe("success");
    expect(checkStatusTone("warn")).toBe("warning");
    expect(checkStatusTone("fail")).toBe("critical");
    expect(checkStatusTone("not_applicable")).toBe("neutral");
  });

  it("never shows red severity on a passing check", () => {
    expect(checkSeverityTone("critical", "pass")).toBe("neutral");
    expect(checkSeverityTone("critical", "fail")).toBe("critical");
    expect(checkSeverityTone("info", "warn")).toBe("info");
  });

  it.each([
    ["ACTIVE", "success"],
    ["DRAFT", "info"],
    ["PAID", "success"],
    ["UNFULFILLED", "warning"],
    ["FULFILLED", "success"],
    ["REFUNDED", "neutral"],
    ["SOMETHING_NEW", "neutral"],
  ])("status %s -> %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it("treats missing statuses as neutral", () => {
    expect(statusTone(null)).toBe("neutral");
  });
});

describe("labels", () => {
  it("turns enums into readable labels, never ALL CAPS", () => {
    expect(enumLabel("UNFULFILLED")).toBe("Unfulfilled");
    expect(enumLabel("PARTIALLY_FULFILLED")).toBe("Partially fulfilled");
    expect(enumLabel("critical")).toBe("Critical");
    expect(enumLabel(null)).toBe("—");
  });

  it("has labels for every risk, reason and check status", () => {
    expect(Object.values(RISK_LABELS)).toEqual([
      "Critical",
      "Low stock",
      "Healthy",
      "Not tracked",
    ]);
    expect(REASON_LABELS.UNFULFILLED_OVER_24H).toBe("Unfulfilled > 24h");
    expect(CHECK_STATUS_LABELS.warn).toBe("Needs attention");
  });

  it("pluralises with thousands separators", () => {
    expect(plural(1, "product")).toBe("1 product");
    expect(plural(1250, "product")).toBe("1,250 products");
  });
});

describe("format", () => {
  const now = new Date("2026-10-30T12:00:00Z");

  it("formats numbers, counts and percentages", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatCount(10000, true)).toBe("10,000+");
    expect(formatPercent(0.873)).toBe("87%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  it("formats money in the shop currency with a safe fallback", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(10, "EUR")).toBe("€10.00");
    expect(formatMoney(10, "NOT_A_CURRENCY")).toBe("10.00 NOT_A_CURRENCY");
  });

  it("formats relative and absolute times", () => {
    expect(formatRelative("2026-10-30T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-30T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelative("2026-10-30T11:00:00Z", now)).toBe("1 hour ago");
    expect(formatRelative("2026-10-28T12:00:00Z", now)).toBe("2 days ago");
    expect(formatRelative("nope", now)).toBe("");
    expect(formatDateTime("2026-10-30T14:05:00Z")).toBe(
      "Oct 30, 2026, 2:05 PM UTC",
    );
    expect(formatDateTime("nope")).toBe("");
  });

  it("computes safe ratios", () => {
    expect(ratio(5, 10)).toBe(0.5);
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(20, 10)).toBe(1);
  });
});

describe("nextBestAction", () => {
  it("prioritises what blocks sales over cosmetic issues", () => {
    const action = nextBestAction([
      { checkId: "seo_description", count: 171 },
      { checkId: "images", count: 135 },
      { checkId: "variant_prices", count: 2 },
    ]);
    expect(action).toMatchObject({ cta: "Review products" });
    expect(action?.body).toMatch(/^2 products have a variant with no price/);
  });

  it("links SEO issues to Readiness for the bulk fix", () => {
    expect(
      nextBestAction([{ checkId: "seo_description", count: 14 }]),
    ).toMatchObject({
      href: "/app/readiness",
      body: expect.stringMatching(
        /^14 products are missing an SEO description/,
      ),
    });
  });

  it("returns null when nothing is actionable", () => {
    expect(nextBestAction([])).toBeNull();
    expect(nextBestAction([{ checkId: "online_store", count: 5 }])).toBeNull();
  });
});

describe("readinessVerdict", () => {
  it("summarises score and open checks in one line", () => {
    expect(readinessVerdict(null, 0).text).toBe("Nothing to check yet");
    expect(readinessVerdict(100, 0)).toEqual({
      tone: "success",
      text: "Ready: every check passes",
    });
    expect(readinessVerdict(89, 3).text).toBe("Almost ready: 3 issues to fix");
    expect(readinessVerdict(60, 1)).toEqual({
      tone: "warning",
      text: "Getting there: 1 issue to fix",
    });
    expect(readinessVerdict(20, 7).tone).toBe("critical");
  });
});
