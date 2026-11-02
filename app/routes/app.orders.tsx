import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import {
  HIGH_VALUE_ORDER_THRESHOLD,
  ORDERS_SAMPLE_CAP,
  RECENT_ORDER_DAYS,
  UNFULFILLED_ALERT_HOURS,
} from "../lib/config";
import type { OrderReason, OrderSeverity } from "../lib/order-ops";
import type { OrderFilter } from "../lib/order-ops/filters";
import { isOrderFilter } from "../lib/order-ops/filters";
import type { OrderRow } from "../lib/services/orders.server";
import {
  loadOrdersPage,
  loadOrdersSummary,
  searchForFilter,
} from "../lib/services/orders.server";
import { isShopifyApiError, toLoaderError } from "../lib/shopify/errors";
import { getOrdersCount } from "../lib/shopify/orders.server";
import { joinQuery, orderNameSearch } from "../lib/shopify/search";
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
  REASON_EXPLANATIONS,
  REASON_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  enumLabel,
  formatCount,
  formatDateTime,
  formatDay,
  formatDayLong,
  formatMoney,
  formatNumber,
  formatRelative,
  plural,
  statusTone,
} from "../lib/presentation";
import {
  Card,
  CardGrid,
  DataCapNotice,
  EmptyState,
  ErrorState,
  FilterTabs,
  PermissionBanner,
  SeverityBadge,
  SplitGrid,
  StatusBadge,
} from "../components/ui";
import {
  ColumnChart,
  HorizontalBarChart,
  MetricCard,
  StackedProportionBar,
} from "../components/charts";

const REASONS = Object.keys(REASON_LABELS) as OrderReason[];
const SORT_FIELDS = ["created", "total"] as const;
const SORT_KEYS = { created: "CREATED_AT", total: "TOTAL_PRICE" } as const;
const SEVERITIES: OrderSeverity[] = ["HIGH", "MEDIUM", "LOW"];

const FILTER_OPTIONS: Array<{ value: OrderFilter | null; label: string }> = [
  { value: null, label: "All" },
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "high_value", label: "High value" },
  { value: "recent", label: `Last ${RECENT_ORDER_DAYS} days` },
  { value: "needs_attention", label: "Needs attention" },
];

/**
 * Order Operations (read-only, no customer data). Query params:
 * - filter: needs_attention (current page) | unfulfilled | high_value | recent
 * - q: order name search (never customer fields)
 * - sort: created | total, asc | desc (server-side; default newest first)
 * - size: 20 | 50 | 100; page + cursor + dir=next|prev: cursor pagination
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const rawFilter = params.get("filter");
  const filter = isOrderFilter(rawFilter) ? rawFilter : null;
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";
  const now = new Date();
  const table = parseTableParams(params, {
    sortFields: SORT_FIELDS,
    defaultSort: { field: "created", dir: "desc" },
  });
  const sort = table.sort ?? { field: "created", dir: "desc" };
  const search = orderNameSearch(table.q);

  try {
    const [summary, page, count] = await Promise.all([
      loadOrdersSummary(admin, session.shop, appCache, now),
      loadOrdersPage(admin, session.shop, appCache, {
        cursor,
        direction,
        filter,
        now,
        search,
        sort: { key: SORT_KEYS[sort.field], reverse: sort.dir === "desc" },
        pageSize: table.size,
      }),
      // "needs attention" is computed by the app, so Shopify can't count it.
      filter === "needs_attention"
        ? null
        : getOrdersCount(
            admin,
            joinQuery(searchForFilter(filter, now), search),
          ).catch((error: unknown) => {
            if (!isShopifyApiError(error)) throw error;
            return null;
          }),
    ]);
    return {
      error: null,
      summary,
      rows: page.rows.map((row) => toRow(row, now)),
      pageRowCount: page.pageRowCount,
      pageInfo: page.pageInfo,
      inventoryCrossCheck: page.inventoryCrossCheck,
      filter,
      count,
      table: { ...table, sort },
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      summary: null,
      rows: [],
      pageRowCount: 0,
      pageInfo: null,
      inventoryCrossCheck: "unavailable" as const,
      filter,
      count: null,
      table: { ...table, sort },
    };
  }
};

function toRow({ order, assessment }: OrderRow, now: Date) {
  return {
    id: order.id,
    name: order.name,
    created: formatRelative(order.createdAt, now),
    createdAbsolute: formatDateTime(order.createdAt),
    total: formatMoney(order.totalAmount, order.currencyCode),
    fulfillmentStatus: order.fulfillmentStatus,
    financialStatus: order.financialStatus,
    reasons: assessment.reasons,
    severity: assessment.severity,
    needsAttention: assessment.needsAttention,
    excluded: assessment.excluded,
  };
}

type Row = ReturnType<typeof toRow>;

export default function OrderOperations() {
  const {
    error,
    summary,
    rows,
    pageRowCount,
    pageInfo,
    inventoryCrossCheck,
    filter,
    count,
    table,
  } = useLoaderData<typeof loader>();
  const url = useTableUrl();
  const loading = useNavigation().state === "loading";
  const permissionMissing = error?.kind === "access_denied";
  const range = pageRange({
    page: table.page,
    size: table.size,
    rowCount: pageRowCount,
    total: count?.count ?? null,
    atLeast: count?.atLeast ?? false,
  });

  return (
    <s-page heading="Order operations">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button
        slot="secondary-actions"
        href="shopify://admin/orders"
        target="_top"
      >
        Open Shopify orders
      </s-button>

      <s-stack gap="base">
        {permissionMissing ? (
          <PermissionBanner
            kind="read"
            feature="orders"
            scopes={[
              "read orders",
              "protected customer data (level 1, no personal fields)",
            ]}
          />
        ) : (
          error && <ErrorState error={error} />
        )}

        {summary && <OrderSummary summary={summary} />}

        {!permissionMissing && (
          <DataTable<Row>
            label="Orders"
            rows={rows}
            rowId={(r) => r.id}
            rowLabel={(r) => `order ${r.name}`}
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
                <TableSearch
                  label="Search orders"
                  placeholder="Search by order number, e.g. 1001"
                  value={table.q}
                  onSearch={(q) => url.set({ q })}
                />
                <FilterTabs
                  label="Show orders"
                  options={FILTER_OPTIONS}
                  value={filter}
                  onChange={(value) => url.set({ filter: value })}
                />
                <DataCapNotice>
                  {filter === "needs_attention" && pageRowCount > 0
                    ? `${plural(rows.length, "order")} on this page need attention (of ${pageRowCount}). `
                    : ""}
                  {!error && inventoryCrossCheck === "unavailable"
                    ? "The low-stock check is unavailable, so that reason isn't shown."
                    : "Only the last 60 days are available; no customer details are shown."}
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
            columns={[
              {
                key: "order",
                header: "Order",
                listSlot: "primary",
                render: (row) => (
                  <s-link
                    href={`shopify://admin/orders/${row.id}`}
                    target="_top"
                    accessibilityLabel={`Open order ${row.name} in Shopify Admin`}
                  >
                    {row.name}
                  </s-link>
                ),
              },
              {
                key: "created",
                header: "Created",
                sortField: "created",
                render: (row) => <CreatedCell row={row} />,
              },
              {
                key: "total",
                header: "Total",
                sortField: "total",
                format: "currency",
                render: (row) => row.total,
              },
              {
                key: "payment",
                header: "Payment",
                listSlot: "inline",
                render: (row) => <StatusBadge status={row.financialStatus} />,
              },
              {
                key: "fulfillment",
                header: "Fulfillment",
                render: (row) => <StatusBadge status={row.fulfillmentStatus} />,
              },
              {
                key: "attention",
                header: "Attention",
                listSlot: "secondary",
                render: (row) => <AttentionCell row={row} />,
              },
            ]}
            rowActions={(row) => (
              <RowActions
                id={row.id}
                label={`order ${row.name}`}
                actions={orderActions(row)}
              />
            )}
            empty={
              error ? null : pageRowCount > 0 ? (
                <EmptyState
                  icon="check-circle"
                  heading="Nothing needs attention on this page"
                  body="Use Next to check older orders."
                />
              ) : filter || table.q ? (
                <EmptyState
                  icon="order"
                  heading="No recent orders match"
                  body="Try another search or filter, or show all recent orders."
                  action={{ label: "Show all", href: "/app/orders" }}
                />
              ) : (
                <EmptyState
                  icon="order"
                  heading="No orders in the last 60 days"
                  body="Orders appear here as they come in. Create a test order to try it out."
                  action={{
                    label: "Create order",
                    href: "shopify://admin/draft_orders/new",
                  }}
                />
              )
            }
          />
        )}
        {!permissionMissing && (
          <s-section>
            <ReasonLegend />
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}

type Summary = NonNullable<Awaited<ReturnType<typeof loader>>["summary"]>;

function OrderSummary({ summary }: { summary: Summary }) {
  const days = summary.perDay.length;
  const window = `last ${plural(days, "day")}`;
  const mix = Object.entries(summary.fulfillmentMix).sort(
    (a, b) => b[1] - a[1],
  );
  const attention = summary.aggregate.needsAttention;
  return (
    <s-stack gap="base">
      <CardGrid>
        <MetricCard
          label="Today"
          value={formatCount(
            summary.counts.today.count,
            summary.counts.today.atLeast,
          )}
          tone="info"
          subtext={`Orders placed today (${summary.timeZone})`}
          trend={summary.perDay.map((d) => d.count)}
          trendLabel={`Per day, ${window}`}
        />
        <MetricCard
          label="Unfulfilled"
          value={formatCount(
            summary.counts.unfulfilled.count,
            summary.counts.unfulfilled.atLeast,
          )}
          tone="warning"
          subtext="Open orders still to ship"
          href="/app/orders?filter=unfulfilled"
          linkLabel="Show unfulfilled"
        />
        <MetricCard
          label="High value"
          value={formatNumber(summary.aggregate.byReason.HIGH_VALUE)}
          tone="info"
          subtext={`${formatNumber(HIGH_VALUE_ORDER_THRESHOLD)} or more (shop currency)`}
          href="/app/orders?filter=high_value"
          linkLabel="Show high value"
        />
        <MetricCard
          label="Needs attention"
          value={formatNumber(attention)}
          tone={attention > 0 ? "critical" : "success"}
          toneLabel={
            attention > 0
              ? `${formatNumber(summary.aggregate.bySeverity.HIGH)} high`
              : "All clear"
          }
          href="/app/orders?filter=needs_attention"
          linkLabel="Review"
        />
      </CardGrid>

      <SplitGrid ratio="2:1">
        <Card
          heading="Orders per day"
          subheading={`${window[0].toUpperCase()}${window.slice(1)} · ${summary.timeZone} time`}
        >
          <ColumnChart
            label={`Orders per day, ${window}`}
            valueLabel="Orders"
            emptyMessage={`No orders in the ${window}.`}
            emptyAction={{
              label: "Create a test order",
              href: "shopify://admin/draft_orders/new",
            }}
            data={summary.perDay.map((d) => ({
              key: d.date,
              label: formatDay(d.date),
              detail: formatDayLong(d.date),
              value: d.count,
            }))}
          />
        </Card>
        <Card
          heading="Fulfillment status"
          subheading={`Of the ${plural(summary.sampleSize, "most recent order")}`}
        >
          <StackedProportionBar
            label="Recent orders by fulfillment status"
            emptyMessage="No recent orders."
            segments={mix.map(([status, count]) => ({
              key: status,
              label: enumLabel(status),
              value: count,
              tone: statusTone(status),
            }))}
          />
        </Card>
      </SplitGrid>

      <Card
        heading="Why orders need attention"
        subheading="Open orders in the recent sample, by reason (an order can have several)"
      >
        <SplitGrid ratio="2:1">
          <HorizontalBarChart
            label="Orders needing attention by reason"
            items={REASONS.map((reason) => ({
              key: reason,
              label: REASON_LABELS[reason],
              value: summary.aggregate.byReason[reason],
              valueText: plural(summary.aggregate.byReason[reason], "order"),
              href:
                reason === "HIGH_VALUE"
                  ? "/app/orders?filter=high_value"
                  : reason === "UNFULFILLED_OVER_24H"
                    ? "/app/orders?filter=unfulfilled"
                    : "/app/orders?filter=needs_attention",
            }))}
          />
          <s-stack gap="small-200">
            <s-text type="strong">Severity</s-text>
            <StackedProportionBar
              label="Orders needing attention by severity"
              emptyMessage="Nothing needs attention right now."
              segments={SEVERITIES.map((severity) => ({
                key: severity,
                label: SEVERITY_LABELS[severity],
                value: summary.aggregate.bySeverity[severity],
                tone: SEVERITY_TONES[severity],
              }))}
            />
          </s-stack>
        </SplitGrid>
      </Card>

      <DataCapNotice>
        Today and Unfulfilled are exact counts. Charts and the other cards use
        the {plural(summary.sampleSize, "most recent order")}
        {summary.capped
          ? ` (capped at ${formatNumber(ORDERS_SAMPLE_CAP)})`
          : ""}
        . Only orders from the last 60 days are available, and no customer
        details are shown.
      </DataCapNotice>
    </s-stack>
  );
}

function orderActions(row: Row): RowAction[] {
  return [
    {
      label: "Open in Shopify Admin",
      href: `shopify://admin/orders/${row.id}`,
      external: true,
    },
  ];
}

/** Relative time with the absolute time on hover/focus. */
function CreatedCell({ row }: { row: Row }) {
  const timeId = `order-${row.id}-time`;
  return (
    <>
      <s-text interestFor={timeId}>{row.created}</s-text>
      <s-tooltip id={timeId}>{row.createdAbsolute}</s-tooltip>
    </>
  );
}

function AttentionCell({ row }: { row: Row }) {
  if (row.excluded) {
    return (
      <s-text color="subdued">
        {row.excluded === "CANCELLED" ? "Cancelled" : "Refunded"}
      </s-text>
    );
  }
  if (!row.needsAttention) {
    return <s-text color="subdued">No action needed</s-text>;
  }
  return (
    <s-stack direction="inline" gap="small-300">
      <SeverityBadge severity={row.severity} />
      {row.reasons.map((reason) => (
        <ReasonBadge key={reason} reason={reason} orderId={row.id} />
      ))}
    </s-stack>
  );
}

function ReasonBadge({
  reason,
  orderId,
}: {
  reason: OrderReason;
  orderId: string;
}) {
  const id = `reason-${orderId}-${reason}`;
  return (
    <>
      <s-text interestFor={id}>
        <s-badge>{REASON_LABELS[reason]}</s-badge>
      </s-text>
      <s-tooltip id={id}>{REASON_EXPLANATIONS[reason]}</s-tooltip>
    </>
  );
}

/** Tooltips aren't keyboard-friendly everywhere, so reasons are also listed. */
function ReasonLegend() {
  return (
    <details className="zj-details">
      <summary>
        <s-text color="subdued">What the attention reasons mean</s-text>
      </summary>
      <s-box paddingBlockStart="small-200">
        <s-stack gap="small-200">
          {REASONS.map((r) => (
            <s-text key={r} color="subdued">
              <s-text type="strong">{REASON_LABELS[r]}: </s-text>
              {REASON_EXPLANATIONS[r]}
            </s-text>
          ))}
          <s-text color="subdued">
            Severity: unfulfilled over {UNFULFILLED_ALERT_HOURS}h counts double;
            High is 3+ points. Cancelled and refunded orders are excluded.
          </s-text>
        </s-stack>
      </s-box>
    </details>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
