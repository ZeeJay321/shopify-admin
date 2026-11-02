import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import {
  CRITICAL_STOCK_THRESHOLD,
  INVENTORY_SAMPLE_CAP,
  LOW_STOCK_THRESHOLD,
} from "../lib/config";
import type { RiskLevel, VariantRisk } from "../lib/inventory-risk";
import {
  loadInventoryPage,
  loadInventorySummary,
} from "../lib/services/inventory-risk.server";
import { isShopifyApiError, toLoaderError } from "../lib/shopify/errors";
import {
  getLocations,
  getVariantsCount,
  inventorySearchQuery,
} from "../lib/shopify/inventory.server";
import { variantSearch } from "../lib/shopify/search";
import {
  formatSort,
  nextSort,
  pageRange,
  parseTableParams,
} from "../lib/tables";
import type { RowAction } from "../components/tables";
import {
  DataTable,
  RowActions,
  TableSearch,
  useTableUrl,
} from "../components/tables";
import {
  RISK_LABELS,
  RISK_TONES,
  formatNumber,
  plural,
} from "../lib/presentation";
import {
  Card,
  CardGrid,
  DataCapNotice,
  EmptyState,
  ErrorState,
  PermissionBanner,
  RiskBadge,
  SplitGrid,
  Toolbar,
} from "../components/ui";
import {
  DonutChart,
  HorizontalBarChart,
  MetricCard,
  StackedProportionBar,
} from "../components/charts";
import { writeAccess } from "../lib/shopify/scopes";
import {
  inventoryActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import type { AdjustTarget } from "../components/actions/inventory-adjust";
import {
  ADJUST_MODAL,
  InventoryAdjustModal,
} from "../components/actions/inventory-adjust";
import { WriteAccessBanner } from "../components/actions/shared";

const RISK_LEVELS: RiskLevel[] = ["critical", "low", "healthy", "untracked"];
const SORT_FIELDS = ["available", "title"] as const;
const SORT_KEYS = { available: "INVENTORY_QUANTITY", title: "TITLE" } as const;

function isRiskLevel(value: string | null): value is RiskLevel {
  return RISK_LEVELS.some((r) => r === value);
}

/**
 * Inventory Risk (read-only). Query params:
 * - risk: critical | low | healthy | untracked (applied to the current page)
 * - location: numeric location id (server-side filter; quantities then
 *   refer to that location)
 * - q: search (product/variant title, SKU), server-side
 * - sort: available | title, asc | desc (server-side; default least stock)
 * - size: 20 | 50 | 100; page + cursor + dir=next|prev: cursor pagination
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;

  const rawRisk = params.get("risk");
  const risk = isRiskLevel(rawRisk) ? rawRisk : null;
  const rawLocation = params.get("location");
  const locationId =
    rawLocation && /^\d+$/.test(rawLocation) ? rawLocation : null;
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";
  const table = parseTableParams(params, {
    sortFields: SORT_FIELDS,
    defaultSort: { field: "available", dir: "asc" },
  });
  const sort = table.sort ?? { field: "available", dir: "asc" };
  const search = variantSearch(table.q);
  const filters = { risk, locationId, q: table.q };
  const canWrite = writeAccess(session.scope).inventory;

  try {
    const [summary, page, { locations }, count] = await Promise.all([
      loadInventorySummary(admin, session.shop, appCache),
      loadInventoryPage(admin, {
        cursor,
        direction,
        locationId,
        search,
        sort: { key: SORT_KEYS[sort.field], reverse: sort.dir === "desc" },
        pageSize: table.size,
      }),
      getLocations(admin),
      // Position text only; never fail the page over it.
      getVariantsCount(admin, inventorySearchQuery(locationId, search)).catch(
        (error: unknown) => {
          if (!isShopifyApiError(error)) throw error;
          return null;
        },
      ),
    ]);
    const rows = page.rows.map(toRow);
    return {
      error: null,
      summary: {
        sampleSize: summary.sampleSize,
        capped: summary.capped,
        counts: summary.counts,
        topAtRisk: summary.topAtRisk.slice(0, 5).map(toRow),
      },
      rows: risk ? rows.filter((r) => r.risk === risk) : rows,
      pageRowCount: rows.length,
      pageInfo: page.pageInfo,
      count,
      table: { ...table, sort },
      locations,
      filters,
      canWrite,
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      summary: null,
      rows: [],
      pageRowCount: 0,
      pageInfo: null,
      count: null,
      table: { ...table, sort },
      locations: [],
      filters,
      canWrite,
    };
  }
};

/** POST only: adjust_inventory (compare-and-set via Shopify). */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: inventoryActionHandlers,
  });

function toRow(r: VariantRisk) {
  return {
    key: r.variant.variantId,
    variantId: r.variant.variantId,
    inventoryItemId: r.variant.inventoryItemId,
    productId: r.variant.productId,
    productTitle: r.variant.productTitle,
    variantTitle: r.variant.variantTitle,
    available: r.available,
    risk: r.risk,
    locations: r.byLocation.map((l) => ({
      id: l.locationId,
      name: l.locationName,
      available: l.available,
    })),
  };
}

type Row = ReturnType<typeof toRow>;

const RISK_HINTS: Record<RiskLevel, string> = {
  critical: `${CRITICAL_STOCK_THRESHOLD} or fewer available`,
  low: `${LOW_STOCK_THRESHOLD} or fewer available`,
  healthy: "Enough stock",
  untracked: "Inventory not tracked",
};

function variantName(row: Pick<Row, "productTitle" | "variantTitle">) {
  return row.variantTitle === "Default Title"
    ? row.productTitle
    : `${row.productTitle} · ${row.variantTitle}`;
}

export default function InventoryRisk() {
  const {
    error,
    summary,
    rows,
    pageRowCount,
    pageInfo,
    count,
    table,
    locations,
    filters,
    canWrite,
  } = useLoaderData<typeof loader>();
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const url = useTableUrl();
  const loading = useNavigation().state === "loading";
  const locationName = locations.find((l) => l.id === filters.locationId)?.name;
  const permissionMissing = error?.kind === "access_denied";
  const range = pageRange({
    page: table.page,
    size: table.size,
    rowCount: pageRowCount,
    total: filters.risk ? null : (count?.count ?? null),
    atLeast: count?.atLeast ?? false,
  });

  const actionsFor = (row: Row): RowAction[] => [
    {
      label: "Adjust stock",
      modal: ADJUST_MODAL,
      disabled:
        !canWrite || row.risk === "untracked" || row.locations.length === 0,
      onClick: () =>
        setAdjustTarget({
          productId: row.productId,
          productTitle: row.productTitle,
          variantTitle: row.variantTitle,
          inventoryItemId: row.inventoryItemId,
          locations: row.locations,
          defaultLocationId: filters.locationId,
        }),
    },
    { label: "View health report", href: `/app/products/${row.productId}` },
    {
      label: "Open in Shopify Admin",
      href: `shopify://admin/products/${row.productId}/variants/${row.variantId}`,
      external: true,
    },
  ];

  return (
    <s-page heading="Inventory risk">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button
        slot="secondary-actions"
        href="shopify://admin/products/inventory"
        target="_top"
      >
        Open Shopify inventory
      </s-button>

      <s-stack gap="base">
        {permissionMissing ? (
          <PermissionBanner
            kind="read"
            feature="inventory risk"
            scopes={["read inventory", "read locations"]}
          />
        ) : (
          error && <ErrorState error={error} />
        )}
        {!error && !canWrite && (
          <WriteAccessBanner action="adjust stock" scope="write_inventory" />
        )}

        {summary && (
          <s-stack gap="base">
            <SplitGrid ratio="1:1">
              <Card
                heading="Risk mix"
                subheading={`${plural(summary.sampleSize, "variant")} by stock level`}
              >
                <DonutChart
                  label="Variants by inventory risk"
                  totalLabel="variants"
                  emptyMessage="No variants to check yet."
                  emptyAction={{
                    label: "Add a product",
                    href: "shopify://admin/products/new",
                  }}
                  segments={RISK_LEVELS.map((level) => ({
                    key: level,
                    label: RISK_LABELS[level],
                    value: summary.counts[level],
                    tone: RISK_TONES[level],
                  }))}
                />
              </Card>
              <CardGrid columns={2}>
                {RISK_LEVELS.map((level) => (
                  <MetricCard
                    key={level}
                    label={RISK_LABELS[level]}
                    value={formatNumber(summary.counts[level])}
                    tone={RISK_TONES[level]}
                    subtext={RISK_HINTS[level]}
                    href={`/app/inventory?risk=${level}`}
                    linkLabel="Show these"
                  />
                ))}
              </CardGrid>
            </SplitGrid>
            <Card
              heading="Lowest stock"
              subheading="Most at-risk tracked variants, least available first"
            >
              <HorizontalBarChart
                label="Lowest-stock variants"
                max={Math.max(
                  LOW_STOCK_THRESHOLD,
                  ...summary.topAtRisk.map((r) => r.available),
                )}
                emptyMessage="No critical or low-stock variants. Nice work."
                items={summary.topAtRisk.map((r) => ({
                  key: r.key,
                  label: variantName(r),
                  href: `/app/products/${r.productId}`,
                  value: Math.max(0, r.available),
                  valueText: `${formatNumber(r.available)} available`,
                  tone: RISK_TONES[r.risk],
                }))}
              />
            </Card>
            <DataCapNotice>
              Based on {plural(summary.sampleSize, "variant")}
              {summary.capped
                ? ` (capped at ${formatNumber(INVENTORY_SAMPLE_CAP)}, least stock first)`
                : ""}
              . Critical is {CRITICAL_STOCK_THRESHOLD} or fewer available, low
              is {LOW_STOCK_THRESHOLD} or fewer; totals add up all locations.
            </DataCapNotice>
          </s-stack>
        )}

        {!permissionMissing && (
          <DataTable<Row>
            label="Variants"
            rows={rows}
            rowId={(r) => r.key}
            rowLabel={(r) => variantName(r)}
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
                    label="Search variants"
                    placeholder="Search by product, variant or SKU"
                    value={filters.q}
                    onSearch={(q) => url.set({ q })}
                  />
                  <s-select
                    label="Risk"
                    labelAccessibilityVisibility="exclusive"
                    value={filters.risk ?? ""}
                    onChange={(event) =>
                      url.set({ risk: event.currentTarget.value || null })
                    }
                  >
                    <s-option value="">All risk levels</s-option>
                    {RISK_LEVELS.map((level) => (
                      <s-option key={level} value={level}>
                        {RISK_LABELS[level]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Location"
                    labelAccessibilityVisibility="exclusive"
                    value={filters.locationId ?? ""}
                    onChange={(event) =>
                      url.set({ location: event.currentTarget.value || null })
                    }
                  >
                    <s-option value="">All locations</s-option>
                    {locations.map((l) => (
                      <s-option key={l.id} value={l.id}>
                        {l.name}
                      </s-option>
                    ))}
                  </s-select>
                </Toolbar>
                {filters.risk && pageRowCount > 0 && (
                  <DataCapNotice>
                    {`${plural(rows.length, "variant")} with this risk on this page (of ${pageRowCount}).`}
                  </DataCapNotice>
                )}
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
            columns={[
              {
                key: "product",
                header: "Product",
                sortField: "title",
                listSlot: "primary",
                render: (row) => (
                  <s-stack gap="small-300">
                    <s-link href={`/app/products/${row.productId}`}>
                      {row.productTitle}
                    </s-link>
                    {row.variantTitle !== "Default Title" && (
                      <s-text color="subdued">{row.variantTitle}</s-text>
                    )}
                  </s-stack>
                ),
              },
              {
                key: "available",
                header: locationName
                  ? `Available at ${locationName}`
                  : "Available",
                sortField: "available",
                format: "numeric",
                render: (row) => (
                  <s-text type="strong">
                    {row.risk === "untracked"
                      ? "—"
                      : formatNumber(row.available)}
                  </s-text>
                ),
              },
              {
                key: "risk",
                header: "Risk",
                listSlot: "inline",
                render: (row) => <RiskBadge risk={row.risk} />,
              },
              {
                key: "locations",
                header: "By location",
                render: (row) => (
                  <LocationBreakdown locations={row.locations} />
                ),
              },
            ]}
            rowActions={(row) => (
              <RowActions
                id={row.key}
                label={variantName(row)}
                actions={actionsFor(row)}
              />
            )}
            empty={
              error ? null : pageRowCount > 0 ? (
                <EmptyState
                  icon="check-circle"
                  heading="Nothing at this risk level on this page"
                  body="Use Next to check more variants, or choose another risk level."
                />
              ) : filters.locationId || filters.q ? (
                <EmptyState
                  icon="inventory"
                  heading="No variants match"
                  body="Try another search or location."
                  action={{ label: "Clear filters", href: "/app/inventory" }}
                />
              ) : (
                <EmptyState
                  icon="inventory"
                  heading="No variants yet"
                  body="Add products with tracked inventory in Shopify Admin to see stock risk here."
                />
              )
            }
          />
        )}
      </s-stack>

      {canWrite && <InventoryAdjustModal target={adjustTarget} />}
    </s-page>
  );
}

/** One location as text; several as a split bar plus the numbers. */
function LocationBreakdown({ locations }: { locations: Row["locations"] }) {
  if (locations.length === 0)
    return <s-text color="subdued">Not stocked</s-text>;
  if (locations.length === 1) {
    const [only] = locations;
    return (
      <s-text color="subdued">{`${only.name}: ${formatNumber(only.available)}`}</s-text>
    );
  }
  return (
    <s-stack gap="small-300">
      <s-box inlineSize="160px">
        <StackedProportionBar
          size="thin"
          showLegend={false}
          label="Available by location"
          emptyMessage="None available"
          segments={locations.map((l) => ({
            key: l.id,
            label: l.name,
            value: Math.max(0, l.available),
            valueText: formatNumber(l.available),
            tone: "info",
          }))}
        />
      </s-box>
      <s-text color="subdued">
        {locations
          .map((l) => `${l.name}: ${formatNumber(l.available)}`)
          .join(" · ")}
      </s-text>
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
