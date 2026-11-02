import { describe, expect, it } from "vitest";
import { affectedPage, affectedRows } from "./affected";
import type { CheckResult, ReadinessProductRow } from "./types";

const index: Record<string, ReadinessProductRow> = Object.fromEntries(
  Array.from({ length: 45 }, (_, i) => {
    const id = String(i + 1);
    return [
      id,
      {
        id,
        title: `Tee ${i + 1}`,
        handle: `tee-${id}`,
        vendor: i % 2 ? "Nike" : "adidas",
        status: "ACTIVE",
        imageUrl: null,
        score: 100 - i,
        description: "",
      },
    ];
  }),
);

const check: CheckResult = {
  id: "online_store",
  name: "Published to Headless",
  description: "",
  group: "publishing",
  severity: "critical",
  weight: 10,
  status: "fail",
  score: 0,
  affectedCount: 46,
  affectedResources: [
    ...Object.keys(index).map((id) => ({
      kind: "product" as const,
      id,
      title: "stale",
      handle: `tee-${id}`,
      problem: "Not published to Headless",
    })),
    { kind: "collection" as const, id: "c1", title: "Empty", handle: "empty" },
  ],
};

const params = { page: 1, size: 20 as const, sort: null, q: "" };

describe("affected table rows", () => {
  it("joins display data and falls back for collections", () => {
    const rows = affectedRows(check, index);
    expect(rows[0]).toMatchObject({
      title: "Tee 1",
      vendor: "adidas",
      score: 100,
      problem: "Not published to Headless",
    });
    expect(rows[45]).toMatchObject({
      kind: "collection",
      title: "Empty",
      vendor: null,
      problem: "Published to Headless",
    });
  });

  it("pages over the full set", () => {
    const rows = affectedRows(check, index);
    expect(affectedPage(rows, { ...params, page: 3 })).toMatchObject({
      total: 46,
      page: 3,
    });
    expect(affectedPage(rows, { ...params, page: 3 }).rows).toHaveLength(6);
    expect(affectedPage(rows, { ...params, page: 99 }).page).toBe(3);
  });

  it("searches and sorts before paging", () => {
    const rows = affectedRows(check, index);
    const found = affectedPage(rows, { ...params, q: "tee 4" });
    expect(found.rows.map((r) => r.title)).toEqual([
      "Tee 4",
      "Tee 40",
      "Tee 41",
      "Tee 42",
      "Tee 43",
      "Tee 44",
      "Tee 45",
    ]);
    const byScore = affectedPage(rows, {
      ...params,
      sort: { field: "score", dir: "asc" },
    });
    expect(byScore.rows[0].title).toBe("Tee 45");
    // The collection has no score, so it sorts last either way.
    const desc = affectedPage(rows, {
      ...params,
      size: 100,
      sort: { field: "score", dir: "desc" },
    });
    expect(desc.rows.at(-1)?.kind).toBe("collection");
  });
});
