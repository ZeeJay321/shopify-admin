import { describe, expect, it } from "vitest";
import {
  joinQuery,
  orderNameSearch,
  productTitleSearch,
  searchTerms,
  variantSearch,
} from "./search";

describe("search builders", () => {
  it("strips operators so input can't change the query", () => {
    expect(searchTerms('hoodie OR status:archived) "x"')).toEqual([
      "hoodie",
      "OR",
      "statusarchived",
      "x",
    ]);
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("a b c d e f g")).toHaveLength(5);
  });

  it("builds product, variant and order searches", () => {
    expect(productTitleSearch("Organic hood")).toBe(
      "title:Organic* AND title:hood*",
    );
    expect(productTitleSearch("")).toBeNull();
    expect(variantSearch("tee xl")).toBe("tee* AND xl*");
    expect(orderNameSearch("#1001")).toBe("name:#1001*");
    expect(orderNameSearch("1001")).toBe("name:#1001*");
    expect(orderNameSearch("SO-12")).toBe("name:SO-12*");
    expect(orderNameSearch("##")).toBeNull();
  });

  it("joins fragments", () => {
    expect(joinQuery("status:active", null, "title:a*")).toBe(
      "(status:active) AND (title:a*)",
    );
    expect(joinQuery(null, "")).toBeNull();
    expect(joinQuery("status:draft", null)).toBe("status:draft");
  });
});
