import { describe, expect, it } from "vitest";
import {
  describeBulk,
  parseBulkIds,
  planContentUpdate,
  summarizeBulk,
  textToHtml,
} from ".";

describe("textToHtml", () => {
  it("escapes markup and keeps paragraphs and line breaks", () => {
    expect(
      textToHtml('Soft <b>cotton</b> & "fair"\nline two\n\nNew para'),
    ).toBe(
      "<p>Soft &lt;b&gt;cotton&lt;/b&gt; &amp; &quot;fair&quot;<br>line two</p><p>New para</p>",
    );
    expect(textToHtml("<script>alert('x')</script>")).toBe(
      "<p>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</p>",
    );
    expect(textToHtml("  \n\n ")).toBe("");
  });
});

describe("planContentUpdate", () => {
  const current = { title: "Untitled", description: "" };
  const good =
    "A warm organic cotton hoodie with a relaxed fit and deep pockets for everyday wear.";

  it("accepts a real title and description", () => {
    const plan = planContentUpdate({
      current,
      next: { title: "  Organic  Hoodie ", description: good },
    });
    expect(plan.valid).toBe(true);
    expect(plan.values.title).toBe("Organic Hoodie");
    expect(plan.summary.title).toEqual({
      before: "Untitled",
      after: "Organic Hoodie",
    });
  });

  it("rejects empty, too long and placeholder titles", () => {
    expect(
      planContentUpdate({ current, next: { title: " ", description: good } })
        .errors[0].field,
    ).toBe("title");
    expect(
      planContentUpdate({
        current,
        next: { title: "x".repeat(256), description: good },
      }).valid,
    ).toBe(false);
    expect(
      planContentUpdate({
        current,
        next: { title: "Test product", description: good },
      }).errors[0].message,
    ).toMatch(/placeholder/);
  });

  it("rejects too-long descriptions and warns on short ones", () => {
    expect(
      planContentUpdate({
        current,
        next: { title: "Hoodie", description: "x".repeat(5001) },
      }).errors[0].field,
    ).toBe("description");
    const short = planContentUpdate({
      current,
      next: { title: "Hoodie", description: "Short." },
    });
    expect(short.valid).toBe(true);
    expect(short.warnings).toHaveLength(1);
  });

  it("marks only the edited field as changed", () => {
    const plan = planContentUpdate({
      current: { title: "Test product", description: good },
      next: { title: "Hoodie", description: good },
    });
    expect(plan.changed).toEqual({ title: true, description: false });
  });

  it("rejects a no-op", () => {
    const plan = planContentUpdate({
      current: { title: "Hoodie", description: good },
      next: { title: "Hoodie ", description: `${good}  ` },
    });
    expect(plan.errors).toEqual([
      { field: "form", message: "Nothing has changed yet." },
    ]);
  });
});

describe("bulk planning", () => {
  it("de-duplicates and validates ids", () => {
    expect(parseBulkIds(["1", "2", "1"])).toEqual({
      ok: true,
      ids: ["1", "2"],
    });
    expect(parseBulkIds([]).ok).toBe(false);
    expect(parseBulkIds(["1", "gid://x"]).ok).toBe(false);
  });

  it("rejects requests over the cap", () => {
    const ids = Array.from({ length: 26 }, (_, i) => String(i + 1));
    const result = parseBulkIds(ids);
    expect(result).toMatchObject({
      ok: false,
      error: { message: "Select 25 products or fewer per update." },
    });
    expect(parseBulkIds(ids.slice(0, 25)).ok).toBe(true);
  });

  it("describes and summarises", () => {
    expect(describeBulk("publish", 25, "Headless Storefront")).toBe(
      "This will publish 25 products to Headless Storefront.",
    );
    expect(describeBulk("activate", 1)).toBe(
      "This will set 1 product to active so shoppers can buy them.",
    );
    const results = [
      { productId: "1", productTitle: "A", ok: true, message: "Published." },
      { productId: "2", productTitle: "B", ok: false, message: "Not found." },
    ];
    expect(summarizeBulk(results)).toEqual({
      succeeded: 1,
      failed: 1,
      message: "1 of 2 updated; 1 need attention.",
    });
    expect(summarizeBulk(results.slice(0, 1)).message).toBe("All 1 updated.");
  });
});
