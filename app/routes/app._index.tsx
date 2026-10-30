import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { HEALTH_SAMPLE_CAP } from "../lib/config";
import { appCache } from "../lib/cache/index.server";
import { loadOrdersSummary } from "../lib/services/orders.server";
import { loadStoreHealth } from "../lib/services/store-health.server";
import { isShopifyApiError, toLoaderError } from "../lib/shopify/errors";
import type { ProductCount } from "../lib/shopify/products.server";
import { ErrorBanner, ScoreBadge, formatCount } from "../components/health-ui";

/** Store Health: catalog counts plus health over a bounded product sample. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // The orders card is optional: missing order access must not break Store Health.
  const orders = loadOrdersSummary(admin, session.shop, appCache).then(
    (summary) => ({
      available: true as const,
      needsAttention: summary.aggregate.needsAttention,
      high: summary.aggregate.bySeverity.HIGH,
      unfulfilled: summary.counts.unfulfilled,
    }),
    (error: unknown) => {
      if (!isShopifyApiError(error)) throw error;
      return { available: false as const, reason: error.kind };
    },
  );

  try {
    const [{ counts, sample }, ordersCard] = await Promise.all([
      loadStoreHealth(admin, session.shop, appCache),
      orders,
    ]);
    return { error: null, counts, sample, ordersCard };
  } catch (error) {
    return {
      error: toLoaderError(error),
      counts: null,
      sample: null,
      ordersCard: null,
    };
  }
};

export default function StoreHealth() {
  const { error, counts, sample, ordersCard } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Store Health">
      {error && <ErrorBanner error={error} />}

      {counts && (
        <s-section heading="Catalog">
          <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
            <CountTile label="Total products" value={counts.all} />
            <CountTile label="Active" value={counts.active} />
            <CountTile label="Draft" value={counts.draft} />
            <CountTile label="Archived" value={counts.archived} />
          </s-grid>
        </s-section>
      )}

      {sample && (
        <s-section heading="Product health">
          {sample.size === 0 ? (
            <s-paragraph>
              No products yet. Add products in Shopify Admin to see health
              scores.
            </s-paragraph>
          ) : (
            <s-stack gap="base">
              <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="small-200">
                    <s-text color="subdued">Average health score</s-text>
                    {sample.averageScore !== null && (
                      <ScoreBadge score={sample.averageScore} />
                    )}
                  </s-stack>
                </s-box>
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="small-200">
                    <s-text color="subdued">Products with issues</s-text>
                    <s-heading>
                      {sample.productsWithIssues} of {sample.size}
                    </s-heading>
                  </s-stack>
                </s-box>
              </s-grid>
              <s-text color="subdued">
                Based on {sample.size} product{sample.size === 1 ? "" : "s"}
                {sample.capped
                  ? ` (sample capped at ${HEALTH_SAMPLE_CAP}, sorted by title)`
                  : ""}
                .
              </s-text>
              <s-stack direction="inline" gap="base">
                <s-link href="/app/products">View all products</s-link>
                <s-link href="/app/inventory">View inventory risk</s-link>
                <s-link href="/app/readiness">Storefront readiness</s-link>
              </s-stack>
            </s-stack>
          )}
        </s-section>
      )}

      {ordersCard && (
        <s-section heading="Orders needing attention">
          {ordersCard.available ? (
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge
                  tone={ordersCard.needsAttention > 0 ? "critical" : "success"}
                >
                  {ordersCard.needsAttention} need attention
                </s-badge>
                {ordersCard.high > 0 && (
                  <s-badge tone="critical">
                    {ordersCard.high} high severity
                  </s-badge>
                )}
                <s-text color="subdued">
                  {formatCount(
                    ordersCard.unfulfilled.count,
                    ordersCard.unfulfilled.atLeast,
                  )}{" "}
                  unfulfilled
                </s-text>
              </s-stack>
              <s-link href="/app/orders?filter=needs_attention">
                Review orders
              </s-link>
            </s-stack>
          ) : (
            <s-paragraph>
              {ordersCard.reason === "access_denied"
                ? "Approve order access (and protected customer data access) to see orders needing attention."
                : "Orders couldn't be loaded right now. Reload to try again."}{" "}
              <s-link href="/app/orders">Order Operations</s-link>
            </s-paragraph>
          )}
        </s-section>
      )}

      {sample && sample.topIssues.length > 0 && (
        <s-section heading="Most common issues">
          <s-ordered-list>
            {sample.topIssues.map((issue) => (
              <s-list-item key={issue.checkId}>
                {issue.label}: {issue.count} product
                {issue.count === 1 ? "" : "s"}
              </s-list-item>
            ))}
          </s-ordered-list>
        </s-section>
      )}
    </s-page>
  );
}

function CountTile({ label, value }: { label: string; value: ProductCount }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{formatCount(value.count, value.atLeast)}</s-heading>
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
