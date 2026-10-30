import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import {
  HIGH_VALUE_ORDER_THRESHOLD,
  ORDERS_SAMPLE_CAP,
  RECENT_ORDER_DAYS,
  UNFULFILLED_ALERT_HOURS,
} from "../lib/config";
import type { OrderReason } from "../lib/order-ops";
import type { OrderFilter } from "../lib/order-ops/filters";
import { isOrderFilter } from "../lib/order-ops/filters";
import type { OrderRow } from "../lib/services/orders.server";
import {
  loadOrdersPage,
  loadOrdersSummary,
} from "../lib/services/orders.server";
import { toLoaderError } from "../lib/shopify/errors";
import {
  REASON_EXPLANATIONS,
  REASON_LABELS,
  formatCount,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  plural,
} from "../lib/presentation";
import {
  CardGrid,
  DataCapNotice,
  EmptyState,
  ErrorState,
  FilterTabs,
  MetricCard,
  PermissionBanner,
  SeverityBadge,
  StatusBadge,
  TableSkeleton,
} from "../components/ui";

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
 * - cursor + dir=next|prev: cursor pagination (newest first)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const rawFilter = params.get("filter");
  const filter = isOrderFilter(rawFilter) ? rawFilter : null;
  const cursor = params.get("cursor");
  const direction = params.get("dir") === "prev" ? "prev" : "next";
  const now = new Date();

  try {
    const [summary, page] = await Promise.all([
      loadOrdersSummary(admin, session.shop, appCache, now),
      loadOrdersPage(admin, session.shop, appCache, {
        cursor,
        direction,
        filter,
        now,
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
  } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const loading = useNavigation().state === "loading";
  const permissionMissing = error?.kind === "access_denied";

  const go = (next: {
    filter?: string | null;
    cursor?: string | null;
    dir?: "next" | "prev";
  }) => {
    const params = new URLSearchParams();
    const f = next.filter !== undefined ? next.filter : filter;
    if (f) params.set("filter", f);
    if (next.cursor) {
      params.set("cursor", next.cursor);
      params.set("dir", next.dir ?? "next");
    }
    setSearchParams(params);
  };

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

      {summary && (
        <s-section accessibilityLabel="Order summary">
          <s-stack gap="base">
            <CardGrid>
              <MetricCard
                label="Today"
                value={formatCount(
                  summary.counts.today.count,
                  summary.counts.today.atLeast,
                )}
                subtext="Orders placed today (shop time)"
              />
              <MetricCard
                label="Unfulfilled"
                value={formatCount(
                  summary.counts.unfulfilled.count,
                  summary.counts.unfulfilled.atLeast,
                )}
                subtext="Open orders still to ship"
                href="/app/orders?filter=unfulfilled"
                linkLabel="Show unfulfilled"
              />
              <MetricCard
                label="High value"
                value={formatNumber(summary.aggregate.byReason.HIGH_VALUE)}
                subtext={`${formatNumber(HIGH_VALUE_ORDER_THRESHOLD)} or more (shop currency)`}
                href="/app/orders?filter=high_value"
                linkLabel="Show high value"
              />
              <MetricCard
                label="Needs attention"
                value={formatNumber(summary.aggregate.needsAttention)}
                tone={
                  summary.aggregate.needsAttention > 0 ? "critical" : "success"
                }
                toneLabel={
                  summary.aggregate.needsAttention > 0
                    ? `${summary.aggregate.bySeverity.HIGH} high`
                    : "All clear"
                }
                href="/app/orders?filter=needs_attention"
                linkLabel="Review"
              />
            </CardGrid>
            <DataCapNotice>
              Today and Unfulfilled are exact counts. High value and Needs
              attention are based on the{" "}
              {plural(summary.sampleSize, "most recent order")}
              {summary.capped
                ? ` (capped at ${formatNumber(ORDERS_SAMPLE_CAP)})`
                : ""}
              . Only orders from the last 60 days are available, and no customer
              details are shown.
            </DataCapNotice>
          </s-stack>
        </s-section>
      )}

      {!permissionMissing && (
        <s-section padding="none" accessibilityLabel="Orders">
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
              <FilterTabs
                label="Show orders"
                options={FILTER_OPTIONS}
                value={filter}
                onChange={(value) => go({ filter: value })}
              />
              <DataCapNotice>
                {filter === "needs_attention" && pageRowCount > 0
                  ? `${plural(rows.length, "order")} on this page need attention (of ${pageRowCount}). `
                  : ""}
                Newest first.
                {!error && inventoryCrossCheck === "unavailable"
                  ? " The low-stock check is unavailable, so that reason isn't shown."
                  : ""}
              </DataCapNotice>
            </s-stack>

            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header>Created</s-table-header>
              <s-table-header format="currency">Total</s-table-header>
              <s-table-header listSlot="inline">Payment</s-table-header>
              <s-table-header>Fulfillment</s-table-header>
              <s-table-header listSlot="secondary">Attention</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <OrderRowView key={row.id} row={row} />
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
                  heading="Nothing needs attention on this page"
                  body="Use Next to check older orders."
                />
              ) : filter ? (
                <EmptyState
                  icon="order"
                  heading="No recent orders match this filter"
                  body="Try another filter, or show all recent orders."
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
              )}
            </s-box>
          )}

          <s-box padding="base">
            <ReasonLegend />
          </s-box>
        </s-section>
      )}
    </s-page>
  );
}

function OrderRowView({ row }: { row: Row }) {
  const timeId = `order-${row.id}-time`;
  return (
    <s-table-row>
      <s-table-cell>
        <s-link
          href={`shopify://admin/orders/${row.id}`}
          target="_top"
          accessibilityLabel={`Open order ${row.name} in Shopify Admin`}
        >
          {row.name}
        </s-link>
      </s-table-cell>
      <s-table-cell>
        <s-text interestFor={timeId}>{row.created}</s-text>
        <s-tooltip id={timeId}>{row.createdAbsolute}</s-tooltip>
      </s-table-cell>
      <s-table-cell>{row.total}</s-table-cell>
      <s-table-cell>
        <StatusBadge status={row.financialStatus} />
      </s-table-cell>
      <s-table-cell>
        <StatusBadge status={row.fulfillmentStatus} />
      </s-table-cell>
      <s-table-cell>
        {row.excluded ? (
          <s-text color="subdued">
            {row.excluded === "CANCELLED" ? "Cancelled" : "Refunded"}
          </s-text>
        ) : row.needsAttention ? (
          <s-stack direction="inline" gap="small-300">
            <SeverityBadge severity={row.severity} />
            {row.reasons.map((reason) => (
              <ReasonBadge key={reason} reason={reason} orderId={row.id} />
            ))}
          </s-stack>
        ) : (
          <s-text color="subdued">No action needed</s-text>
        )}
      </s-table-cell>
    </s-table-row>
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
  const reasons = Object.keys(REASON_LABELS) as OrderReason[];
  return (
    <s-stack gap="small-200">
      <s-text type="strong">What the attention reasons mean</s-text>
      {reasons.map((r) => (
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
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
