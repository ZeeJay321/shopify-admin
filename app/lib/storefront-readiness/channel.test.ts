import { describe, expect, it } from "vitest";
import { chooseChannel, scoringChannel } from "./channel";
import type { SalesChannel } from "./types";

const channel = (
  id: string,
  name: string,
  productCount: number,
  isOnlineStore = false,
): SalesChannel => ({ id, name, productCount, isOnlineStore, atLeast: false });

const online = (count: number) => channel("os", "Online Store", count, true);

describe("chooseChannel", () => {
  it("1. uses a valid requested channel", () => {
    const pos = channel("pos", "Point of Sale", 3);
    const choice = chooseChannel([online(10), pos], "pos");
    expect(choice).toMatchObject({ reason: "requested", headlessHint: false });
    expect(choice.channel?.id).toBe("pos");
  });

  it("ignores an unknown requested channel", () => {
    expect(chooseChannel([online(10)], "nope").reason).toBe("online_store");
  });

  it("2. prefers Online Store when it has products", () => {
    const choice = chooseChannel(
      [channel("h", "Headless", 500), online(1)],
      null,
    );
    expect(choice.channel?.id).toBe("os");
    expect(choice.reason).toBe("online_store");
  });

  it("3. picks the busiest other channel when Online Store is empty", () => {
    const choice = chooseChannel(
      [
        online(0),
        channel("pos", "Point of Sale", 5),
        channel("h", "Headless", 172),
      ],
      null,
    );
    expect(choice).toMatchObject({
      reason: "most_products",
      headlessHint: true,
    });
    expect(choice.channel?.name).toBe("Headless");
  });

  it("breaks ties by name, then id", () => {
    const choice = chooseChannel(
      [
        online(0),
        channel("b", "Beta", 5),
        channel("a2", "Alpha", 5),
        channel("a1", "Alpha", 5),
      ],
      null,
    );
    expect(choice.channel?.id).toBe("a1");
  });

  it("hints when a requested headless channel is chosen over an empty Online Store", () => {
    expect(
      chooseChannel([online(0), channel("h", "Headless", 9)], "h").headlessHint,
    ).toBe(true);
  });

  it("4. falls back to Online Store, or nothing for an empty list", () => {
    expect(
      chooseChannel([online(0), channel("pos", "POS", 0)], null),
    ).toMatchObject({
      reason: "fallback",
      channel: { id: "os" },
    });
    expect(chooseChannel([], null)).toEqual({
      channel: null,
      reason: "fallback",
      headlessHint: false,
    });
  });
});

describe("scoringChannel", () => {
  it("picks the busiest non-Online-Store channel, even when Online Store is used", () => {
    expect(
      scoringChannel([
        online(50),
        channel("pos", "POS", 3),
        channel("h", "Headless", 172),
      ])?.id,
    ).toBe("h");
  });

  it("is null when no other channel has products", () => {
    expect(scoringChannel([online(50), channel("pos", "POS", 0)])).toBeNull();
    expect(scoringChannel([])).toBeNull();
  });
});
