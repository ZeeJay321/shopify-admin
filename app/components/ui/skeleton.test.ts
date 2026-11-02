import { describe, expect, it } from "vitest";
import { skeletonFor } from "./states";

describe("skeletonFor", () => {
  it("matches each page's layout", () => {
    expect(skeletonFor("/app")).toBe("dashboard");
    expect(skeletonFor("/app/products")).toBe("table");
    expect(skeletonFor("/app/products/123")).toBe("detail");
    expect(skeletonFor("/app/inventory")).toBe("table");
    expect(skeletonFor("/app/orders")).toBe("table");
    expect(skeletonFor("/app/readiness")).toBe("readiness");
  });
});
