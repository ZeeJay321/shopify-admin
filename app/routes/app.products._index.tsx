import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { scoreProduct } from "../lib/product-health";
import { toLoaderError } from "../lib/shopify/errors";
import { toNumericId } from "../lib/shopify/gid";
import { getProductsPage } from "../lib/shopify/products.server";
import {
  PRODUCT_STATUSES,
  isProductStatusFilter,
} from "../lib/shopify/product-status";
import {
  ErrorBanner,
  ProductStatusBadge,
  ScoreBadge,
} from "../components/health-ui";

/**
 * Product Health list. Query params:
 * - status: ACTIVE | DRAFT | ARCHIVED (server-side filter)
 * - issues=1: only rows with issues (applied to the current page; scores
 *   are computed by the app, so Shopify can't filter on them)
 * - cursor + dir=next|prev: cursor pagination
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;

  const rawStatus = params.get("status")?.toUpperCase() ?? null;
  const status = isProductStatusFilter(rawStatus) ? rawStatus : null;
  const onlyIssues = params.get("issues") === "1";
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";

  try {
    const page = await getProductsPage(admin, { cursor, direction, status });
    const rows = page.products.map((record) => {
      const health = scoreProduct(record.snapshot);
      return {
        id: toNumericId(record.snapshot.id),
        title: record.snapshot.title || "(untitled)",
        status: record.snapshot.status,
        imageUrl: record.imageUrl,
        imageAlt: record.imageAlt,
        score: health.score,
        issueCount: health.issues.length,
      };
    });

    return {
      error: null,
      rows: onlyIssues ? rows.filter((r) => r.issueCount > 0) : rows,
      pageRowCount: rows.length,
      pageInfo: page.pageInfo,
      filters: { status, onlyIssues },
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      rows: [],
      pageRowCount: 0,
      pageInfo: null,
      filters: { status, onlyIssues },
    };
  }
};

export default function ProductHealthList() {
  const { error, rows, pageRowCount, pageInfo, filters } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading";

  const go = (next: {
    status?: string | null;
    onlyIssues?: boolean;
    cursor?: string | null;
    dir?: "next" | "prev";
  }) => {
    const params = new URLSearchParams();
    const status = next.status !== undefined ? next.status : filters.status;
    const onlyIssues = next.onlyIssues ?? filters.onlyIssues;
    if (status) params.set("status", status);
    if (onlyIssues) params.set("issues", "1");
    if (next.cursor) {
      params.set("cursor", next.cursor);
      params.set("dir", next.dir ?? "next");
    }
    setSearchParams(params);
  };

  return (
    <s-page heading="Product Health">
      <s-link slot="breadcrumb-actions" href="/app">
        Store Health
      </s-link>

      {error && <ErrorBanner error={error} />}

      <s-section padding="none">
        <s-table
          loading={loading}
          paginate
          hasNextPage={pageInfo?.hasNextPage ?? false}
          hasPreviousPage={pageInfo?.hasPreviousPage ?? false}
          onNextPage={() =>
            go({ cursor: pageInfo?.endCursor ?? null, dir: "next" })
          }
          onPreviousPage={() =>
            go({ cursor: pageInfo?.startCursor ?? null, dir: "prev" })
          }
        >
          <s-grid
            slot="filters"
            gridTemplateColumns="1fr auto"
            gap="base"
            alignItems="center"
          >
            <s-select
              label="Status"
              value={filters.status ?? ""}
              onChange={(event) =>
                go({ status: event.currentTarget.value || null })
              }
            >
              <s-option value="">All statuses</s-option>
              {PRODUCT_STATUSES.map((s) => (
                <s-option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </s-option>
              ))}
            </s-select>
            <s-checkbox
              label="Only products with issues"
              checked={filters.onlyIssues}
              onChange={(event) =>
                go({ onlyIssues: event.currentTarget.checked })
              }
            />
          </s-grid>

          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header listSlot="secondary">Health score</s-table-header>
            <s-table-header format="numeric">Issues</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <s-table-row key={row.id}>
                <s-table-cell>
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-thumbnail
                      src={row.imageUrl ?? undefined}
                      alt={row.imageAlt ?? row.title}
                      size="small"
                    />
                    <s-link href={`/app/products/${row.id}`}>
                      {row.title}
                    </s-link>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <ProductStatusBadge status={row.status} />
                </s-table-cell>
                <s-table-cell>
                  <ScoreBadge score={row.score} />
                </s-table-cell>
                <s-table-cell>{row.issueCount}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {!error && rows.length === 0 && (
          <s-box padding="base">
            <s-paragraph>
              {pageRowCount > 0
                ? "No products on this page have issues. Use Next to check the next page."
                : filters.status
                  ? "No products match this status."
                  : "No products yet. Add products in Shopify Admin to see their health."}
            </s-paragraph>
          </s-box>
        )}
      </s-section>

      {filters.onlyIssues && pageRowCount > 0 && (
        <s-text color="subdued">
          Showing {rows.length} of {pageRowCount} products on this page that
          have issues.
        </s-text>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
