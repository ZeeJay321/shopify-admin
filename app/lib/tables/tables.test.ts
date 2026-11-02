import { describe, expect, it } from "vitest";
import {
  clampPage,
  exceedsCap,
  nextSort,
  pageRange,
  pageSlice,
  pageState,
  parseSort,
  parseTableParams,
  pruneSelection,
  searchRows,
  setPage,
  sortRows,
  toggleRow,
  totalPages,
  withParams,
} from ".";

describe("paging", () => {
  it("counts pages and clamps", () => {
    expect(totalPages(172, 20)).toBe(9);
    expect(totalPages(0, 20)).toBe(1);
    expect(clampPage(0, 172, 20)).toBe(1);
    expect(clampPage(99, 172, 20)).toBe(9);
    expect(clampPage(2.7, 172, 20)).toBe(2);
    expect(clampPage(Number.NaN, 172, 20)).toBe(1);
  });

  it("formats first, middle, last and partial pages", () => {
    expect(
      pageRange({ page: 1, size: 20, rowCount: 20, total: 172 }).text,
    ).toBe("Showing 1–20 of 172");
    expect(
      pageRange({ page: 2, size: 20, rowCount: 20, total: 172 }).text,
    ).toBe("Showing 21–40 of 172");
    expect(pageRange({ page: 9, size: 20, rowCount: 12, total: 172 })).toEqual({
      from: 161,
      to: 172,
      text: "Showing 161–172 of 172",
    });
  });

  it("handles unknown, capped and empty totals", () => {
    expect(pageRange({ page: 3, size: 50, rowCount: 50 }).text).toBe(
      "Showing 101–150",
    );
    expect(
      pageRange({
        page: 1,
        size: 100,
        rowCount: 100,
        total: 10000,
        atLeast: true,
      }).text,
    ).toBe("Showing 1–100 of 10,000+");
    expect(pageRange({ page: 1, size: 20, rowCount: 0, total: 0 }).text).toBe(
      "No results",
    );
    // A stale total never reads "21–40 of 30".
    expect(pageRange({ page: 2, size: 20, rowCount: 20, total: 30 }).text).toBe(
      "Showing 21–40 of 40",
    );
  });

  it("slices in-memory pages, including after a page size change", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(pageSlice(items, 3, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice(items, 3, 50)).toEqual(items); // clamped to page 1
  });
});

describe("params", () => {
  const fields = ["title", "score"] as const;

  it("parses valid params", () => {
    const params = new URLSearchParams(
      "page=3&size=50&sort=score:desc&q=%20tee%20",
    );
    expect(parseTableParams(params, { sortFields: fields })).toEqual({
      page: 3,
      size: 50,
      sort: { field: "score", dir: "desc" },
      q: "tee",
    });
  });

  it("falls back to defaults for junk", () => {
    const params = new URLSearchParams(
      "page=-2&size=33&sort=price:up&q=" + "x".repeat(300),
    );
    const parsed = parseTableParams(params, {
      sortFields: fields,
      defaultSort: { field: "title", dir: "asc" },
    });
    expect(parsed).toMatchObject({
      page: 1,
      size: 20,
      sort: { field: "title", dir: "asc" },
    });
    expect(parsed.q).toHaveLength(100);
    expect(parseSort("title:sideways", fields)).toBeNull();
  });

  it("toggles sort direction", () => {
    expect(nextSort(null, "title")).toEqual({ field: "title", dir: "asc" });
    expect(nextSort({ field: "title", dir: "asc" }, "title")).toEqual({
      field: "title",
      dir: "desc",
    });
    expect(nextSort({ field: "title", dir: "desc" }, "score")).toEqual({
      field: "score",
      dir: "asc",
    });
  });

  it("resets the position when search, filters, sort or size change", () => {
    const current = new URLSearchParams(
      "page=4&cursor=abc&dir=next&status=ACTIVE&q=tee",
    );
    expect(withParams(current, { q: "hoodie" }).toString()).toBe(
      "status=ACTIVE&q=hoodie",
    );
    expect(withParams(current, { page: "5" }).get("cursor")).toBe("abc");
    expect(withParams(current, { status: null }).has("status")).toBe(false);
  });
});

describe("sorting and search", () => {
  const rows = [
    { t: "beta", n: 2 },
    { t: "Alpha", n: null },
    { t: "alpha", n: 1 },
    { t: "Product 10", n: 3 },
    { t: "Product 9", n: 3 },
  ];
  const accessors = {
    t: (r: (typeof rows)[number]) => r.t,
    n: (r: (typeof rows)[number]) => r.n,
  };

  it("sorts strings case-insensitively and numerically, stably", () => {
    expect(
      sortRows(rows, { field: "t", dir: "asc" }, accessors).map((r) => r.t),
    ).toEqual(["Alpha", "alpha", "beta", "Product 9", "Product 10"]);
  });

  it("puts nulls last in both directions and keeps ties in order", () => {
    expect(
      sortRows(rows, { field: "n", dir: "desc" }, accessors).map((r) => r.t),
    ).toEqual(["Product 10", "Product 9", "beta", "alpha", "Alpha"]);
    expect(sortRows(rows, null, accessors)).toEqual(rows);
  });

  it("searches title contains, case-insensitively", () => {
    expect(searchRows(rows, " ALPHA ", (r) => r.t)).toHaveLength(2);
    expect(searchRows(rows, "", (r) => r.t)).toHaveLength(5);
  });
});

describe("selection", () => {
  it("toggles rows and selects or clears a page", () => {
    let sel = toggleRow(new Set(), "a");
    expect([...sel]).toEqual(["a"]);
    sel = setPage(sel, ["a", "b", "c"], true);
    expect(pageState(sel, ["a", "b", "c"])).toBe("all");
    sel = toggleRow(sel, "b");
    expect(pageState(sel, ["a", "b", "c"])).toBe("some");
    sel = setPage(sel, ["a", "b", "c"], false);
    expect(pageState(sel, ["a", "b", "c"])).toBe("none");
  });

  it("prunes rows that left the page and enforces the cap", () => {
    const sel = new Set(["a", "b", "x"]);
    expect([...pruneSelection(sel, ["a", "b"])]).toEqual(["a", "b"]);
    const same = new Set(["a"]);
    expect(pruneSelection(same, ["a"])).toBe(same);
    expect(
      exceedsCap(new Set(Array.from({ length: 26 }, (_, i) => `${i}`)), 25),
    ).toBe(true);
    expect(exceedsCap(new Set(["a"]), 25)).toBe(false);
  });
});
