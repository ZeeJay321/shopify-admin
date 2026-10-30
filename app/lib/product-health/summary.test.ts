import { describe, expect, it } from "vitest";
import { scoreProduct } from "./score";
import { summarizeGroups } from "./summary";
import { perfectProduct, variant } from "./test-fixtures";

describe("summarizeGroups", () => {
  it("returns all five groups passing for a perfect product", () => {
    const groups = summarizeGroups(scoreProduct(perfectProduct()));
    expect(groups.map((g) => [g.id, g.status, g.issueCount])).toEqual([
      ["content", "pass", 0],
      ["seo", "pass", 0],
      ["variants", "pass", 0],
      ["inventory", "pass", 0],
      ["publishing", "pass", 0],
    ]);
    expect(groups.reduce((sum, g) => sum + g.earned, 0)).toBe(100);
  });

  it("rolls up the worst status and counts issues per group", () => {
    const groups = summarizeGroups(
      scoreProduct(
        perfectProduct({
          description: "",
          imageCount: 1,
          variants: [variant({ inventoryQuantity: 3 })],
        }),
      ),
    );
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.content).toMatchObject({ status: "fail", issueCount: 2 });
    expect(byId.inventory).toMatchObject({ status: "warn", issueCount: 1 });
    expect(byId.seo).toMatchObject({ status: "pass", issueCount: 0 });
  });
});
