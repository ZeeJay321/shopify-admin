import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { BULK_ACTION_MAX, SEO_BATCH_MAX } from "../lib/config";
import { adminOnlyReason, productFixes } from "../lib/actions";
import { scoreProduct } from "../lib/product-health";
import { appCache } from "../lib/cache/index.server";
import {
  productListActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import { isShopifyApiError, toLoaderError } from "../lib/shopify/errors";
import { toNumericId } from "../lib/shopify/gid";
import {
  getProductsCount,
  getProductsPage,
  productListQuery,
} from "../lib/shopify/products.server";
import {
  PRODUCT_STATUSES,
  isProductStatusFilter,
} from "../lib/shopify/product-status";
import { productTitleSearch } from "../lib/shopify/search";
import { writeAccess } from "../lib/shopify/scopes";
import type { Selection } from "../lib/tables";
import {
  formatSort,
  nextSort,
  pageRange,
  parseTableParams,
  pruneSelection,
} from "../lib/tables";
import { enumLabel, plural, scoreBand, statusTone } from "../lib/presentation";
import {
  Card,
  CountBadge,
  DataCapNotice,
  EmptyState,
  ErrorState,
  SplitGrid,
  StatusBadge,
  Toolbar,
} from "../components/ui";
import { InlineScoreBar, StackedProportionBar } from "../components/charts";
import type { RowAction } from "../components/tables";
import {
  DataTable,
  RowActions,
  TableSearch,
  useTableUrl,
} from "../components/tables";
import { WriteAccessBanner } from "../components/actions/shared";
import type { BulkTarget } from "../components/actions/bulk-dialog";
import { BulkFixDialog } from "../components/actions/bulk-dialog";
import type { ContentTarget } from "../components/actions/content-edit";
import { ContentEditDialog } from "../components/actions/content-edit";
import { SeoBatchDialog } from "../components/actions/seo-batch";
import { useModalTarget } from "../components/actions/modal-target";

const SORT_FIELDS = ["title"] as const;
const SORT_KEYS = { title: "TITLE" } as const;

/**
 * Product Health list. Query params:
 * - status: ACTIVE | DRAFT | ARCHIVED (server-side filter)
 * - q: title search (server-side)
 * - issues=1: only rows with issues (applied to the current page; scores
 *   are computed by the app, so Shopify can't filter on them)
 * - sort: title:asc | title:desc (server-side)
 * - size: 20 | 50 | 100; page + cursor + dir=next|prev: cursor pagination
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;

  const rawStatus = params.get("status")?.toUpperCase() ?? null;
  const status = isProductStatusFilter(rawStatus) ? rawStatus : null;
  const onlyIssues = params.get("issues") === "1";
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";
  const table = parseTableParams(params, {
    sortFields: SORT_FIELDS,
    defaultSort: { field: "title", dir: "asc" },
  });
  const search = productTitleSearch(table.q);
  const filters = { status, onlyIssues, q: table.q };
  const canWrite = writeAccess(session.scope).products;
  const sort = table.sort ?? { field: "title", dir: "asc" };

  try {
    const [page, count] = await Promise.all([
      getProductsPage(admin, {
        cursor,
        direction,
        status,
        search,
        sort: { key: SORT_KEYS[sort.field], reverse: sort.dir === "desc" },
        pageSize: table.size,
      }),
      // The position text is optional: never fail the page over it.
      getProductsCount(admin, productListQuery(status, search)).catch(
        (error: unknown) => {
          if (!isShopifyApiError(error)) throw error;
          return null;
        },
      ),
    ]);
    const rows = page.products.map((record) => {
      const health = scoreProduct(record.snapshot);
      return {
        id: toNumericId(record.snapshot.id),
        title: record.snapshot.title || "(untitled)",
        rawTitle: record.snapshot.title,
        description: record.snapshot.description,
        vendor: record.vendor,
        status: record.snapshot.status,
        imageUrl: record.imageUrl,
        imageAlt: record.imageAlt,
        score: health.score,
        issueCount: health.issues.length,
        fixes: productFixes(record.snapshot.status, health.checks),
        adminReason: adminOnlyReason(health.checks),
      };
    });

    return {
      error: null,
      rows: onlyIssues ? rows.filter((r) => r.issueCount > 0) : rows,
      pageRowCount: rows.length,
      pageInfo: page.pageInfo,
      count,
      table: { ...table, sort },
      filters,
      canWrite,
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      rows: [],
      pageRowCount: 0,
      pageInfo: null,
      count: null,
      table: { ...table, sort },
      filters,
      canWrite,
    };
  }
};

/** POST only: row and bulk fixes (see productListActionHandlers). */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: productListActionHandlers,
  });

type Row = Awaited<ReturnType<typeof loader>>["rows"][number];

const BANDS = [
  { key: "good", label: "Good (80+)", tone: "success" },
  { key: "needs work", label: "Needs work (50–79)", tone: "warning" },
  { key: "poor", label: "Poor (under 50)", tone: "critical" },
] as const;

const MODALS = {
  seo: "products-seo-modal",
  bulk: "products-bulk-modal",
  edit: "products-edit-modal",
} as const;

/** Score band and status mix of the rows on this page. */
function PageSummary({ rows }: { rows: Row[] }) {
  const statuses = [...new Set(rows.map((r) => r.status))];
  return (
    <SplitGrid ratio="1:1">
      <Card
        heading="Health on this page"
        subheading={plural(rows.length, "product")}
      >
        <StackedProportionBar
          label="Products on this page by health"
          segments={BANDS.map((band) => ({
            key: band.key,
            label: band.label,
            tone: band.tone,
            value: rows.filter((r) => scoreBand(r.score) === band.key).length,
          }))}
        />
      </Card>
      <Card
        heading="Status on this page"
        subheading={plural(rows.length, "product")}
      >
        <StackedProportionBar
          label="Products on this page by status"
          segments={statuses.map((status) => ({
            key: status,
            label: enumLabel(status),
            tone: statusTone(status),
            value: rows.filter((r) => r.status === status).length,
          }))}
        />
      </Card>
    </SplitGrid>
  );
}

export default function ProductHealthList() {
  const {
    error,
    rows,
    pageRowCount,
    pageInfo,
    count,
    table,
    filters,
    canWrite,
  } = useLoaderData<typeof loader>();
  const url = useTableUrl();
  const loading = useNavigation().state === "loading";
  const [selected, setSelected] = useState<Selection>(new Set());
  const visible = pruneSelection(
    selected,
    rows.map((r) => r.id),
  );

  const seo = useModalTarget<string[]>(MODALS.seo);
  const bulk = useModalTarget<BulkTarget>(MODALS.bulk);
  const edit = useModalTarget<ContentTarget>(MODALS.edit);

  const filtered = Boolean(filters.status || filters.onlyIssues || filters.q);
  const chosen = rows.filter((r) => visible.has(r.id));
  const activatable = chosen.filter((r) => r.fixes.includes("activate"));
  const seoFixable = chosen.filter((r) => r.fixes.includes("seo"));
  const range = pageRange({
    page: table.page,
    size: table.size,
    rowCount: pageRowCount,
    total: filters.onlyIssues ? null : (count?.count ?? null),
    atLeast: count?.atLeast ?? false,
  });

  const actionsFor = (row: Row): RowAction[] => {
    const actions: RowAction[] = [];
    if (row.fixes.includes("activate")) {
      actions.push({
        label: "Activate",
        disabled: !canWrite,
        onClick: () =>
          bulk.open({
            kind: "activate",
            items: [{ productId: row.id, productTitle: row.title }],
          }),
      });
    }
    if (row.fixes.includes("edit")) {
      actions.push({
        label: "Edit title and description",
        disabled: !canWrite,
        onClick: () =>
          edit.open({
            id: row.id,
            title: row.rawTitle,
            description: row.description,
          }),
      });
    }
    if (row.fixes.includes("seo")) {
      actions.push({
        label: "Apply suggested SEO",
        disabled: !canWrite,
        onClick: () => seo.open([row.id]),
      });
    }
    if (row.fixes.includes("adjust_stock")) {
      actions.push({
        label: "Adjust stock",
        href: `/app/inventory?q=${encodeURIComponent(row.title)}`,
      });
    }
    actions.push({
      label: "View health report",
      href: `/app/products/${row.id}`,
    });
    actions.push({
      label: "Open in Shopify Admin",
      href: `shopify://admin/products/${row.id}`,
      external: true,
    });
    return actions;
  };

  return (
    <s-page heading="Product health">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button slot="secondary-actions" href="/app/readiness">
        Storefront readiness
      </s-button>

      <s-stack gap="base">
        {error && <ErrorState error={error} />}
        {!error && !canWrite && (
          <WriteAccessBanner action="fix products from this list" />
        )}

        {rows.length > 0 && <PageSummary rows={rows} />}

        <DataTable<Row>
          label="Products"
          rows={rows}
          rowId={(r) => r.id}
          rowLabel={(r) => r.title}
          loading={loading}
          sort={table.sort}
          onSort={(field) => {
            const sortField = SORT_FIELDS.find((f) => f === field);
            if (sortField) {
              url.set({ sort: formatSort(nextSort(table.sort, sortField)) });
            }
          }}
          toolbar={
            <s-stack gap="small-200">
              <Toolbar columns={3}>
                <TableSearch
                  label="Search products"
                  placeholder="Search by title"
                  value={filters.q}
                  onSearch={(q) => url.set({ q })}
                />
                <s-select
                  label="Status"
                  labelAccessibilityVisibility="exclusive"
                  value={filters.status ?? ""}
                  onChange={(event) =>
                    url.set({ status: event.currentTarget.value || null })
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
                    url.set({
                      issues: event.currentTarget.checked ? "1" : null,
                    })
                  }
                />
              </Toolbar>
              <DataCapNotice>
                {filters.onlyIssues
                  ? `${plural(rows.length, "product")} with issues on this page (of ${pageRowCount}). `
                  : ""}
                Search matches words in the title that start with what you type.
              </DataCapNotice>
            </s-stack>
          }
          pagination={{
            hasNext: pageInfo?.hasNextPage ?? false,
            hasPrevious: pageInfo?.hasPreviousPage ?? false,
            onNext: () => url.pageTo("next", pageInfo?.endCursor, table.page),
            onPrevious: () =>
              url.pageTo("prev", pageInfo?.startCursor, table.page),
            rangeText: range.text,
            pageSize: table.size,
            onPageSize: (size) => url.set({ size: String(size) }),
          }}
          selection={
            canWrite
              ? {
                  selected: visible,
                  onChange: setSelected,
                  cap: BULK_ACTION_MAX,
                  bulkActions: (
                    <>
                      <s-button
                        disabled={activatable.length === 0}
                        onClick={() =>
                          bulk.open({
                            kind: "activate",
                            items: activatable.map((r) => ({
                              productId: r.id,
                              productTitle: r.title,
                            })),
                          })
                        }
                      >
                        {`Activate (${activatable.length})`}
                      </s-button>
                      <s-button
                        disabled={
                          seoFixable.length === 0 ||
                          seoFixable.length > SEO_BATCH_MAX
                        }
                        onClick={() => seo.open(seoFixable.map((r) => r.id))}
                      >
                        {seoFixable.length > SEO_BATCH_MAX
                          ? `SEO: select ${SEO_BATCH_MAX} or fewer`
                          : `Apply suggested SEO (${seoFixable.length})`}
                      </s-button>
                    </>
                  ),
                }
              : undefined
          }
          columns={[
            {
              key: "product",
              header: "Product",
              sortField: "title",
              listSlot: "primary",
              render: (row) => (
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-thumbnail
                    src={row.imageUrl ?? undefined}
                    alt={row.imageAlt ?? row.title}
                    size="small"
                  />
                  <s-stack gap="small-300">
                    <s-link href={`/app/products/${row.id}`}>
                      {row.title}
                    </s-link>
                    {row.vendor && (
                      <s-text color="subdued">{row.vendor}</s-text>
                    )}
                  </s-stack>
                </s-stack>
              ),
            },
            {
              key: "status",
              header: "Status",
              listSlot: "inline",
              render: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: "score",
              header: "Health score",
              listSlot: "secondary",
              render: (row) => <InlineScoreBar score={row.score} />,
            },
            {
              key: "issues",
              header: "Issues",
              render: (row) => (
                <s-stack gap="small-300">
                  <CountBadge count={row.issueCount} noun="issue" />
                  {row.adminReason && (
                    <s-text color="subdued">{row.adminReason}</s-text>
                  )}
                </s-stack>
              ),
            },
          ]}
          rowActions={(row) => (
            <RowActions
              id={row.id}
              label={row.title}
              actions={actionsFor(row)}
            />
          )}
          empty={
            error ? null : pageRowCount > 0 ? (
              <EmptyState
                icon="check-circle"
                heading="No issues on this page"
                body="Every product on this page passes its checks. Use Next to check the next page."
              />
            ) : filtered ? (
              <EmptyState
                heading="No products match"
                body="Try a different search or status, or turn off the issues filter."
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
            )
          }
        />
      </s-stack>

      {canWrite && (
        <>
          <SeoBatchDialog modalId={MODALS.seo} productIds={seo.target ?? []} />
          <BulkFixDialog modalId={MODALS.bulk} target={bulk.target} />
          <ContentEditDialog modalId={MODALS.edit} target={edit.target} />
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
