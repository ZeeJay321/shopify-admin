import { describe, expect, it } from "vitest";
import { scoreProduct } from "./score";
import { perfectProduct } from "./test-fixtures";

const publishing = (overrides: Parameters<typeof perfectProduct>[0]) =>
  scoreProduct(perfectProduct(overrides)).checks.find(
    (c) => c.id === "online_store",
  );

describe("Publishing check with a sales channel", () => {
  const headless = { name: "Headless Storefront", published: true };

  it("passes when published to the store's sales channel but not Online Store", () => {
    expect(
      publishing({ publishedToOnlineStore: false, salesChannel: headless }),
    ).toMatchObject({
      status: "pass",
      earned: 5,
      message: "Published to Headless Storefront.",
    });
  });

  it("scores a headless-only product the same as an Online Store one", () => {
    const headlessOnly = scoreProduct(
      perfectProduct({ publishedToOnlineStore: false, salesChannel: headless }),
    );
    const onlineOnly = scoreProduct(
      perfectProduct({ publishedToOnlineStore: true }),
    );
    expect(headlessOnly.score).toBe(onlineOnly.score);
    expect(headlessOnly.issues).toHaveLength(0);
  });

  it("fails when on neither, naming the channel", () => {
    expect(
      publishing({
        publishedToOnlineStore: false,
        salesChannel: { ...headless, published: false },
      }),
    ).toMatchObject({
      status: "fail",
      earned: 0,
      message: "Not published to Headless Storefront or the Online Store.",
    });
  });

  it("still passes on Online Store alone", () => {
    expect(
      publishing({
        publishedToOnlineStore: true,
        salesChannel: { ...headless, published: false },
      })?.status,
    ).toBe("pass");
  });

  it("keeps the old Online Store-only behaviour without channel info", () => {
    expect(
      publishing({ publishedToOnlineStore: false, salesChannel: null }),
    ).toMatchObject({
      status: "fail",
      label: "Online Store",
      message: "Not published to the Online Store.",
    });
  });
});
