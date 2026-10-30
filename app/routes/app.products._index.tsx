import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PRODUCTS_PAGE_SIZE } from "../lib/config";
import { scoreProduct } from "../lib/product-health";
import { toLoaderError } from "../lib/shopify/errors";
import { toNumericId } from "../lib/shopify/gid";
import { getProductsPage } from "../lib/shopify/products.server";
import {
  PRODUCT_STATUSES,
  isProductStatusFilter,
} from "../lib/shopify/product-status";
import { enumLabel, plural } from "../lib/presentation";
import {
  CountBadge,
  DataCapNotice,
  EmptyState,
  ErrorState,
  ScoreIndicator,
  StatusBadge,
  TableSkeleton,
  Toolbar,
} from "../components/ui";

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
        vendor: record.vendor,
        handle: record.handle,
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

type Row = Awaited<ReturnType<typeof loader>>["rows"][number];

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

  const filtered = Boolean(filters.status || filters.onlyIssues);

  return (
    <s-page heading="Product health">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button slot="secondary-actions" href="/app/readiness">
        Storefront readiness
      </s-button>

      {error && <ErrorState error={error} />}

      <s-section padding="none" accessibilityLabel="Products">
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
          <s-stack slot="filters" gap="small-200">
            <Toolbar>
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
                    {enumLabel(s)}
                  </s-option>
                ))}
              </s-select>
              <s-switch
                label="Only products with issues"
                checked={filters.onlyIssues}
                onChange={(event) =>
                  go({ onlyIssues: event.currentTarget.checked })
                }
              />
            </Toolbar>
            <DataCapNotice>
              {filters.onlyIssues
                ? `${plural(rows.length, "product")} with issues on this page (of ${pageRowCount}). `
                : `${plural(rows.length, "product")} on this page. `}
              Sorted by title, {PRODUCTS_PAGE_SIZE} per page.
            </DataCapNotice>
          </s-stack>

          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header listSlot="secondary">Health score</s-table-header>
            <s-table-header>Issues</s-table-header>
            <s-table-header>
              <s-text accessibilityVisibility="exclusive">Open</s-text>
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <ProductRow key={row.id} row={row} />
            ))}
          </s-table-body>
        </s-table>

        {!error && rows.length === 0 && (
          <s-box padding="base">
            {loading ? (
              <TableSkeleton />
            ) : pageRowCount > 0 ? (
              <EmptyState
                icon="check-circle"
                heading="No issues on this page"
                body="Every product on this page passes its checks. Use Next to check the next page."
              />
            ) : filtered ? (
              <EmptyState
                heading="No products match these filters"
                body="Try a different status or turn off the issues filter."
                action={{ label: "Clear filters", href: "/app/products" }}
              />
            ) : (
              <EmptyState
                icon="product"
                heading="No products yet"
                body="Add products in Shopify Admin and they'll be scored here automatically."
                action={{
                  label: "Add product",
                  href: "shopify://admin/products/new",
                }}
              />
            )}
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

function ProductRow({ row }: { row: Row }) {
  const subtitle = [row.vendor, row.handle].filter(Boolean).join(" · ");
  return (
    <s-table-row>
      <s-table-cell>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-thumbnail
            src={row.imageUrl ?? undefined}
            alt={row.imageAlt ?? row.title}
            size="small"
          />
          <s-stack gap="small-300">
            <s-link href={`/app/products/${row.id}`}>{row.title}</s-link>
            {subtitle && <s-text color="subdued">{subtitle}</s-text>}
          </s-stack>
        </s-stack>
      </s-table-cell>
      <s-table-cell>
        <StatusBadge status={row.status} />
      </s-table-cell>
      <s-table-cell>
        <ScoreIndicator score={row.score} size="compact" />
      </s-table-cell>
      <s-table-cell>
        <CountBadge count={row.issueCount} noun="issue" />
      </s-table-cell>
      <s-table-cell>
        <s-button
          variant="tertiary"
          icon="chevron-right"
          href={`/app/products/${row.id}`}
          accessibilityLabel={`Open health report for ${row.title}`}
        />
      </s-table-cell>
    </s-table-row>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
