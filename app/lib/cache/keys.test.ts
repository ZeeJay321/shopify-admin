import { describe, expect, it } from "vitest";
import {
  productHealthKey,
  storeHealthSampleKey,
  storeHealthSampleKeyFor,
} from "./keys";

describe("channel-aware cache keys", () => {
  it("include the scoring channel and keep the original names without one", () => {
    expect(productHealthKey("42").name).toBe("product-health:42");
    expect(productHealthKey("42", "gid://shopify/Publication/2").name).toBe(
      "product-health:42:gid://shopify/Publication/2",
    );
    expect(storeHealthSampleKeyFor(null)).toBe(storeHealthSampleKey);
    expect(storeHealthSampleKeyFor("p").name).toBe("store-health-sample:p");
  });
});
