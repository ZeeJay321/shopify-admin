import { describe, expect, it, vi } from "vitest";
import type { Page } from "./pagination";
import { collectPages } from "./pagination";

/** Fake connection of `total` numbered nodes. */
function fakeConnection(total: number) {
  return vi.fn(
    async (cursor: string | null, pageSize: number): Promise<Page<number>> => {
      const start = cursor ? Number(cursor) : 0;
      const nodes = Array.from(
        { length: Math.max(0, Math.min(pageSize, total - start)) },
        (_, i) => start + i,
      );
      const end = start + nodes.length;
      return {
        nodes,
        pageInfo: {
          hasNextPage: end < total,
          endCursor: nodes.length ? String(end) : null,
        },
      };
    },
  );
}

describe("collectPages", () => {
  it("follows cursors across multiple pages", async () => {
    const fetchPage = fakeConnection(25);
    const result = await collectPages(fetchPage, { cap: 100, pageSize: 10 });
    expect(result.nodes).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(result.capped).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([null, "10", "20"]);
  });

  it("stops when hasNextPage is false", async () => {
    const fetchPage = vi.fn(async (): Promise<Page<string>> => ({
      nodes: ["a", "b"],
      pageInfo: { hasNextPage: false, endCursor: "x" },
    }));
    const result = await collectPages(fetchPage, { cap: 100, pageSize: 10 });
    expect(result).toEqual({ nodes: ["a", "b"], capped: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("respects the cap and shrinks the last page", async () => {
    const fetchPage = fakeConnection(1000);
    const result = await collectPages(fetchPage, { cap: 25, pageSize: 10 });
    expect(result.nodes).toHaveLength(25);
    expect(result.capped).toBe(true);
    expect(fetchPage.mock.calls.map((c) => c[1])).toEqual([10, 10, 5]);
  });

  it("is not capped when the data ends exactly at the cap", async () => {
    const result = await collectPages(fakeConnection(20), {
      cap: 20,
      pageSize: 10,
    });
    expect(result.nodes).toHaveLength(20);
    expect(result.capped).toBe(false);
  });
});
