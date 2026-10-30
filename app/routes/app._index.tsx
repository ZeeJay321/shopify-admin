import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { HEALTH_SAMPLE_CAP } from "../lib/config";
import { appCache } from "../lib/cache/index.server";
import { loadInventorySummary } from "../lib/services/inventory-risk.server";
import { loadOrdersSummary } from "../lib/services/orders.server";
import { loadStoreHealth } from "../lib/services/store-health.server";
import { isShopifyApiError, toLoaderError } from "../lib/shopify/errors";
import { writeAccess } from "../lib/shopify/scopes";
import type { CheckId } from "../lib/product-health/types";
import {
  RISK_LABELS,
  RISK_TONES,
  formatCount,
  formatNumber,
  nextBestAction,
  plural,
  scoreTone,
} from "../lib/presentation";
import {
  Card,
  CardGrid,
  DataCapNotice,
  ErrorState,
  IssueList,
  LabeledProgress,
  MetricCard,
  ProportionBars,
  ScoreIndicator,
  SplitGrid,
} from "../components/ui";

/** Store Health: catalog counts plus health over a bounded product sample. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Optional cards: a missing permission must not break Store Health.
  const optional = <T,>(promise: Promise<T>) =>
    promise.then(
      (value) => ({ available: true as const, value }),
      (error: unknown) => {
        if (!isShopifyApiError(error)) throw error;
        return { available: false as const, reason: error.kind };
      },
    );
  const orders = optional(loadOrdersSummary(admin, shop, appCache));
  const inventory = optional(loadInventorySummary(admin, shop, appCache));

  try {
    const [{ counts, sample }, ordersResult, inventoryResult] =
      await Promise.all([
        loadStoreHealth(admin, shop, appCache),
        orders,
        inventory,
      ]);
    return {
      error: null,
      counts,
      sample,
      orders: ordersResult.available
        ? {
            available: true as const,
            needsAttention: ordersResult.value.aggregate.needsAttention,
            high: ordersResult.value.aggregate.bySeverity.HIGH,
            unfulfilled: ordersResult.value.counts.unfulfilled,
            today: ordersResult.value.counts.today,
          }
        : { available: false as const, reason: ordersResult.reason },
      inventory: inventoryResult.available
        ? {
            available: true as const,
            counts: inventoryResult.value.counts,
            sampleSize: inventoryResult.value.sampleSize,
          }
        : { available: false as const, reason: inventoryResult.reason },
      access: writeAccess(session.scope),
    };
  } catch (error) {
    return {
      error: toLoaderError(error),
      counts: null,
      sample: null,
      orders: null,
      inventory: null,
      access: writeAccess(session.scope),
    };
  }
};

/** Where each issue type is best fixed. */
const ISSUE_LINKS: Partial<Record<CheckId, string>> = {
  seo_title: "/app/readiness",
  seo_description: "/app/readiness",
  out_of_stock: "/app/inventory?risk=critical",
  low_stock: "/app/inventory?risk=low",
  status_active: "/app/products?status=DRAFT",
};

export default function StoreHealth() {
  const { error, counts, sample, orders, inventory, access } =
    useLoaderData<typeof loader>();
  const next = sample ? nextBestAction(sample.topIssues) : null;

  return (
    <s-page heading="Store health">
      {next && (
        <s-button slot="primary-action" variant="primary" href={next.href}>
          {next.cta}
        </s-button>
      )}
      <s-button slot="secondary-actions" href="/app/products">
        View products
      </s-button>

      {error && <ErrorState error={error} />}

      {next && (
        <s-section>
          <s-stack
            direction="inline"
            gap="base"
            alignItems="center"
            justifyContent="space-between"
          >
            <s-stack gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-icon type="lightbulb" />
                <s-heading>{next.heading}</s-heading>
              </s-stack>
              <s-text>{next.body}</s-text>
            </s-stack>
            <s-button href={next.href}>{next.cta}</s-button>
          </s-stack>
        </s-section>
      )}

      {counts && sample && (
        <s-section accessibilityLabel="Key metrics">
          <s-stack gap="base">
            <CardGrid>
              <MetricCard
                label="Products"
                value={formatCount(counts.all.count, counts.all.atLeast)}
                subtext={`${formatCount(counts.active.count, counts.active.atLeast)} active · ${formatCount(counts.draft.count, counts.draft.atLeast)} draft · ${formatCount(counts.archived.count, counts.archived.atLeast)} archived`}
                href="/app/products"
                linkLabel="View products"
              />
              <Card>
                <s-stack gap="small-200">
                  <ScoreIndicator
                    score={sample.averageScore}
                    label="Average health score"
                  />
                  <s-link href="/app/products">See scores by product</s-link>
                </s-stack>
              </Card>
              <MetricCard
                label="Products with issues"
                value={formatNumber(sample.productsWithIssues)}
                subtext={`of ${plural(sample.size, "product")} checked`}
                href="/app/products?issues=1"
                linkLabel="Show products with issues"
              />
              {orders?.available ? (
                <MetricCard
                  label="Orders needing attention"
                  value={formatNumber(orders.needsAttention)}
                  tone={orders.needsAttention > 0 ? "critical" : "success"}
                  toneLabel={orders.needsAttention > 0 ? "Review" : "All clear"}
                  subtext={`${formatCount(orders.unfulfilled.count, orders.unfulfilled.atLeast)} unfulfilled`}
                  href="/app/orders?filter=needs_attention"
                  linkLabel="Review orders"
                />
              ) : (
                <MetricCard
                  label="Orders needing attention"
                  value="—"
                  subtext={
                    orders?.reason === "access_denied"
                      ? "Approve order access to see this."
                      : "Orders couldn't be loaded right now."
                  }
                  href="/app/orders"
                  linkLabel="Open orders"
                />
              )}
            </CardGrid>
            <DataCapNotice>
              Health is based on {plural(sample.size, "product")}
              {sample.capped
                ? ` (capped at ${formatNumber(HEALTH_SAMPLE_CAP)}, sorted by title)`
                : ""}
              .
            </DataCapNotice>
          </s-stack>
        </s-section>
      )}

      {sample && (
        <SplitGrid>
          <s-stack gap="base">
            <s-section heading="Health by area">
              <s-stack gap="base">
                {sample.groupAverages.map((g) => (
                  <LabeledProgress
                    key={g.id}
                    label={g.label}
                    value={g.earned}
                    max={g.weight}
                    tone={scoreTone(Math.round((g.earned / g.weight) * 100))}
                    valueText={`${g.earned} / ${g.weight} points on average`}
                  />
                ))}
              </s-stack>
            </s-section>

            <s-section heading="Top issues">
              {sample.topIssues.length === 0 ? (
                <s-text color="subdued">No issues found. Nice work.</s-text>
              ) : (
                <IssueList
                  items={sample.topIssues.map((issue) => ({
                    key: issue.checkId,
                    label: issue.label,
                    count: issue.count,
                    href:
                      ISSUE_LINKS[issue.checkId] ?? "/app/products?issues=1",
                  }))}
                />
              )}
            </s-section>
          </s-stack>

          <s-stack gap="base">
            <s-section heading="Inventory">
              {inventory?.available ? (
                <s-stack gap="base">
                  <ProportionBars
                    total={inventory.sampleSize}
                    segments={(["critical", "low", "healthy"] as const).map(
                      (risk) => ({
                        key: risk,
                        label: RISK_LABELS[risk],
                        value: inventory.counts[risk],
                        tone: RISK_TONES[risk],
                      }),
                    )}
                  />
                  <s-link href="/app/inventory">View inventory risk</s-link>
                </s-stack>
              ) : (
                <s-stack gap="small-200">
                  <s-text color="subdued">
                    {inventory?.reason === "access_denied"
                      ? "Approve inventory access to see stock risk."
                      : "Inventory couldn't be loaded right now."}
                  </s-text>
                  <s-link href="/app/inventory">Open inventory</s-link>
                </s-stack>
              )}
            </s-section>

            {orders?.available && (
              <s-section heading="Orders">
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="small-200">
                    <s-badge tone={orders.high > 0 ? "critical" : "success"}>
                      {`${orders.high} high severity`}
                    </s-badge>
                    <s-badge>{`${formatCount(orders.today.count, orders.today.atLeast)} today`}</s-badge>
                  </s-stack>
                  <s-link href="/app/orders">View order operations</s-link>
                </s-stack>
              </s-section>
            )}

            <s-section heading="App status">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-icon type="check-circle-filled" tone="success" />
                  <s-text>Connected · live data from Shopify</s-text>
                </s-stack>
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-icon
                    type={
                      access.products && access.inventory
                        ? "check-circle-filled"
                        : "info"
                    }
                    tone={
                      access.products && access.inventory ? "success" : "info"
                    }
                  />
                  <s-text>
                    {access.products && access.inventory
                      ? "Fix actions enabled"
                      : "Fix actions need new permissions"}
                  </s-text>
                </s-stack>
                <s-link href="/app/readiness">
                  Check storefront readiness
                </s-link>
              </s-stack>
            </s-section>
          </s-stack>
        </SplitGrid>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
