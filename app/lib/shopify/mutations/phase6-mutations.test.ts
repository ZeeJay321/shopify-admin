import { describe, expect, it, vi } from "vitest";
import type { AdminGraphqlClient } from "../client";
import {
  isPublicationGid,
  mapPublishUserErrors,
  publishProduct,
} from "./publication.server";
import { updateProductContent } from "./product.server";

const PUB = "gid://shopify/Publication/7";

function client(body: unknown) {
  const graphql = vi.fn(async () => new Response(JSON.stringify(body)));
  const c: AdminGraphqlClient = { graphql };
  return { client: c, graphql };
}

const sent = (graphql: ReturnType<typeof client>["graphql"]) =>
  graphql.mock.calls[0] as unknown as [
    string,
    { variables: Record<string, unknown> },
  ];

describe("publishProduct", () => {
  it("publishes to the given publication", async () => {
    const { client: c, graphql } = client({
      data: { publishablePublish: { userErrors: [] } },
    });
    expect(await publishProduct(c, "42", PUB)).toEqual({
      ok: true,
      data: { published: true },
    });
    const [query, { variables }] = sent(graphql);
    expect(query).toContain("publishablePublish(id: $id, input: $input)");
    expect(variables).toEqual({
      id: "gid://shopify/Product/42",
      input: [{ publicationId: PUB }],
    });
  });

  it("is idempotent: Shopify accepts an already-published product", async () => {
    const { client: c } = client({
      data: { publishablePublish: { userErrors: [] } },
    });
    expect((await publishProduct(c, "42", PUB)).ok).toBe(true);
  });

  it("maps userErrors", async () => {
    const { client: c } = client({
      data: {
        publishablePublish: {
          userErrors: [{ field: ["id"], message: "Product does not exist" }],
        },
      },
    });
    expect(await publishProduct(c, "42", PUB)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      mapPublishUserErrors([{ field: null, message: "Publication is locked" }]),
    ).toMatchObject({
      code: "validation",
    });
    expect(mapPublishUserErrors([])).toBeNull();
  });

  it("throws access_denied without write_publications", async () => {
    const { client: c } = client({
      errors: [
        {
          message: "Access denied for publishablePublish field.",
          extensions: { code: "ACCESS_DENIED" },
        },
      ],
    });
    await expect(publishProduct(c, "42", PUB)).rejects.toMatchObject({
      kind: "access_denied",
    });
  });

  it("surfaces throttling after one retry", async () => {
    const graphql = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [
              { message: "Throttled", extensions: { code: "THROTTLED" } },
            ],
          }),
        ),
    );
    vi.useFakeTimers();
    const pending = publishProduct({ graphql }, "42", PUB).catch(
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await pending).toMatchObject({ kind: "throttled" });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid ids before calling Shopify", async () => {
    const { client: c, graphql } = client({});
    expect(
      await publishProduct(c, "42", "gid://shopify/Product/1"),
    ).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    await expect(publishProduct(c, "abc", PUB)).rejects.toMatchObject({
      kind: "invalid_id",
    });
    expect(graphql).not.toHaveBeenCalled();
    expect(isPublicationGid(PUB)).toBe(true);
  });
});

describe("updateProductContent", () => {
  it("sends title and descriptionHtml through productUpdate", async () => {
    const { client: c, graphql } = client({
      data: {
        productUpdate: {
          product: { id: "gid://shopify/Product/42", title: "Hoodie" },
          userErrors: [],
        },
      },
    });
    const result = await updateProductContent(c, "42", {
      title: "Hoodie",
      descriptionHtml: "<p>Warm</p>",
    });
    expect(result).toEqual({ ok: true, data: { title: "Hoodie" } });
    expect(sent(graphql)[1].variables).toEqual({
      product: {
        id: "gid://shopify/Product/42",
        title: "Hoodie",
        descriptionHtml: "<p>Warm</p>",
      },
    });
  });

  it("maps title and description userErrors to form fields", async () => {
    for (const [field, expected] of [
      [["title"], "title"],
      [["descriptionHtml"], "description"],
    ] as const) {
      const { client: c } = client({
        data: {
          productUpdate: {
            product: null,
            userErrors: [{ field, message: "is too long" }],
          },
        },
      });
      expect(
        await updateProductContent(c, "42", {
          title: "x",
          descriptionHtml: "",
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "validation", field: expected },
      });
    }
  });
});
