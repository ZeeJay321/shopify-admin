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
import { REASON_LABELS, SEVERITY_TONES } from "../lib/order-ops";
import { relativeTime } from "../lib/order-ops/dates";
import type { OrderFilter } from "../lib/order-ops/filters";
import { ORDER_FILTERS, isOrderFilter } from "../lib/order-ops/filters";
import type { OrderRow } from "../lib/services/orders.server";
import {
  loadOrdersPage,
  loadOrdersSummary,
} from "../lib/services/orders.server";
import { toLoaderError } from "../lib/shopify/errors";
import { ErrorBanner, formatCount } from "../components/health-ui";

const FILTER_LABELS: Record<OrderFilter, string> = {
  needs_attention: "Needs attention",
  unfulfilled: "Unfulfilled",
  high_value: `High value (${HIGH_VALUE_ORDER_THRESHOLD}+)`,
  recent: `Last ${RECENT_ORDER_DAYS} days`,
};

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
    created: relativeTime(order.createdAt, now),
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

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  const text = status.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
    <s-page heading="Order Operations">
      <s-link slot="breadcrumb-actions" href="/app">
        Store Health
      </s-link>

      {error && <ErrorBanner error={error} />}
      {error?.kind === "access_denied" && (
        <s-banner tone="info" heading="Order access needed">
          Order Operations needs the read orders permission and protected
          customer data access (level 1, no personal fields). Approve the
          updated access request when you open the app, and make sure protected
          customer data access is configured for the app in the Partner
          Dashboard.
        </s-banner>
      )}

      <s-banner tone="info">
        Only orders from the last 60 days are available with the current
        permissions. This page shows no customer details.
      </s-banner>

      {summary && (
        <s-section heading="Summary">
          <s-stack gap="base">
            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              <Tile
                label="Today"
                value={formatCount(
                  summary.counts.today.count,
                  summary.counts.today.atLeast,
                )}
              />
              <Tile
                label="Unfulfilled"
                value={formatCount(
                  summary.counts.unfulfilled.count,
                  summary.counts.unfulfilled.atLeast,
                )}
              />
              <Tile
                label="High value"
                value={String(summary.aggregate.byReason.HIGH_VALUE)}
              />
              <Tile
                label="Needs attention"
                value={String(summary.aggregate.needsAttention)}
                tone={
                  summary.aggregate.needsAttention > 0 ? "critical" : "success"
                }
              />
            </s-grid>
            <s-text color="subdued">
              Today and Unfulfilled are exact counts. High value and Needs
              attention are based on the {summary.sampleSize} most recent order
              {summary.sampleSize === 1 ? "" : "s"}
              {summary.capped ? ` (capped at ${ORDERS_SAMPLE_CAP})` : ""}.
              Attention rules: unfulfilled for more than{" "}
              {UNFULFILLED_ALERT_HOURS}h, total of {HIGH_VALUE_ORDER_THRESHOLD}{" "}
              or more (shop currency), or containing a low-stock item. Cancelled
              and refunded orders are excluded.
            </s-text>
          </s-stack>
        </s-section>
      )}

      {!error && inventoryCrossCheck === "unavailable" && (
        <s-banner tone="warning">
          The low-stock check is unavailable (inventory permissions missing or
          inventory couldn&apos;t be loaded). Other attention rules still apply.
        </s-banner>
      )}

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
          <s-grid slot="filters" gridTemplateColumns="1fr" gap="base">
            <s-select
              label="Show"
              value={filter ?? ""}
              onChange={(event) =>
                go({ filter: event.currentTarget.value || null })
              }
            >
              <s-option value="">All recent orders</s-option>
              {ORDER_FILTERS.map((f) => (
                <s-option key={f} value={f}>
                  {FILTER_LABELS[f]}
                </s-option>
              ))}
            </s-select>
          </s-grid>

          <s-table-header-row>
            <s-table-header listSlot="primary">Order</s-table-header>
            <s-table-header>Created</s-table-header>
            <s-table-header format="currency">Total</s-table-header>
            <s-table-header listSlot="inline">Fulfillment</s-table-header>
            <s-table-header>Payment</s-table-header>
            <s-table-header listSlot="secondary">Attention</s-table-header>
            <s-table-header>Shopify Admin</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <OrderRowView key={row.id} row={row} />
            ))}
          </s-table-body>
        </s-table>

        {!error && rows.length === 0 && (
          <s-box padding="base">
            <s-paragraph>
              {pageRowCount > 0
                ? "No orders on this page need attention. Use Next to check older orders."
                : filter
                  ? "No recent orders match this filter."
                  : "No orders in the last 60 days. Create a test order to see it here."}
            </s-paragraph>
          </s-box>
        )}
      </s-section>

      {filter === "needs_attention" && pageRowCount > 0 && (
        <s-text color="subdued">
          Showing {rows.length} of {pageRowCount} orders on this page that need
          attention.
        </s-text>
      )}
    </s-page>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "critical" | "success";
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        {tone ? (
          <s-badge tone={tone}>{value}</s-badge>
        ) : (
          <s-heading>{value}</s-heading>
        )}
      </s-stack>
    </s-box>
  );
}

function OrderRowView({ row }: { row: Row }) {
  const fulfilled = row.fulfillmentStatus === "FULFILLED";
  const paid = row.financialStatus === "PAID";
  return (
    <s-table-row>
      <s-table-cell>
        <s-text type="strong">{row.name}</s-text>
      </s-table-cell>
      <s-table-cell>{row.created}</s-table-cell>
      <s-table-cell>{row.total}</s-table-cell>
      <s-table-cell>
        <s-badge tone={fulfilled ? "success" : "warning"}>
          {statusLabel(row.fulfillmentStatus)}
        </s-badge>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={paid ? "success" : "neutral"}>
          {statusLabel(row.financialStatus)}
        </s-badge>
      </s-table-cell>
      <s-table-cell>
        {row.excluded ? (
          <s-text color="subdued">{statusLabel(row.excluded)}</s-text>
        ) : row.needsAttention ? (
          <s-stack direction="inline" gap="small-300">
            <s-badge tone={SEVERITY_TONES[row.severity]}>
              {row.severity}
            </s-badge>
            {row.reasons.map((reason) => (
              <s-badge key={reason} tone="neutral">
                {REASON_LABELS[reason]}
              </s-badge>
            ))}
          </s-stack>
        ) : (
          <s-text color="subdued">—</s-text>
        )}
      </s-table-cell>
      <s-table-cell>
        <s-link href={`shopify://admin/orders/${row.id}`} target="_top">
          Open order
        </s-link>
      </s-table-cell>
    </s-table-row>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
