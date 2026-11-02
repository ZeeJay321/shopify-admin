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
import type { RiskLevel } from "../lib/inventory-risk/types";
import {
  RISK_LABELS,
  RISK_TONES,
  enumLabel,
  formatCount,
  formatDay,
  formatDayLong,
  formatNumber,
  nextBestAction,
  plural,
  scoreTone,
  scoreVerdict,
  statusTone,
} from "../lib/presentation";
import {
  Callout,
  Card,
  CardGrid,
  DataCapNotice,
  ErrorState,
  PermissionBanner,
  SplitGrid,
} from "../components/ui";
import {
  ColumnChart,
  DonutChart,
  Histogram,
  HorizontalBarChart,
  MetricCard,
  ScoreGauge,
  StackedProportionBar,
} from "../components/charts";

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
            perDay: ordersResult.value.perDay,
            timeZone: ordersResult.value.timeZone,
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

const RISK_ORDER: RiskLevel[] = ["critical", "low", "healthy", "untracked"];

export default function StoreHealth() {
  const { error, counts, sample, orders, inventory, access } =
    useLoaderData<typeof loader>();
  const next = sample ? nextBestAction(sample.topIssues) : null;
  const missingWrite = [
    !access.products && "update products",
    !access.inventory && "update inventory",
  ].filter((s): s is string => Boolean(s));

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
      <s-button slot="secondary-actions" href="/app/readiness">
        Storefront readiness
      </s-button>

      <s-stack gap="base">
        {error && <ErrorState error={error} />}
        {!error && missingWrite.length > 0 && (
          <PermissionBanner
            kind="write"
            feature="fix products and stock from this app"
            scopes={missingWrite}
          />
        )}

        {next && (
          <Callout
            heading={next.heading}
            body={next.body}
            action={{ label: next.cta, href: next.href }}
          />
        )}

        {counts && sample && (
          <CardGrid>
            <MetricCard
              label="Products"
              value={formatCount(counts.all.count, counts.all.atLeast)}
              tone="info"
              href="/app/products"
              linkLabel="View products"
            >
              <StackedProportionBar
                label="Products by status"
                size="thin"
                segments={(["active", "draft", "archived"] as const).map(
                  (key) => ({
                    key,
                    label: enumLabel(key),
                    value: counts[key].count,
                    valueText: formatCount(
                      counts[key].count,
                      counts[key].atLeast,
                    ),
                    tone: statusTone(key.toUpperCase()),
                  }),
                )}
              />
            </MetricCard>
            <MetricCard
              label="Average health"
              value={
                sample.averageScore === null
                  ? "—"
                  : `${sample.averageScore} / 100`
              }
              tone={
                sample.averageScore === null
                  ? "neutral"
                  : scoreTone(sample.averageScore)
              }
              toneLabel={
                sample.averageScore === null
                  ? undefined
                  : scoreVerdict(sample.averageScore)
              }
              subtext={`Across ${plural(sample.size, "product")}`}
              href="/app/products"
              linkLabel="See scores by product"
            />
            <MetricCard
              label="Products with issues"
              value={formatNumber(sample.productsWithIssues)}
              tone={sample.productsWithIssues > 0 ? "warning" : "success"}
              subtext={`of ${plural(sample.size, "product")} checked`}
              href="/app/products?issues=1"
              linkLabel="Show products with issues"
            />
            {orders?.available ? (
              <MetricCard
                label="Orders needing attention"
                value={formatNumber(orders.needsAttention)}
                tone={orders.needsAttention > 0 ? "critical" : "success"}
                toneLabel={
                  orders.needsAttention > 0
                    ? `${formatNumber(orders.high)} high`
                    : "All clear"
                }
                subtext={`${formatCount(orders.unfulfilled.count, orders.unfulfilled.atLeast)} unfulfilled · ${formatCount(orders.today.count, orders.today.atLeast)} today`}
                trend={orders.perDay.map((d) => d.count)}
                trendLabel={`Orders per day, last ${plural(orders.perDay.length, "day")}`}
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
        )}

        {sample && (
          <SplitGrid ratio="1:2">
            <Card
              heading="Average health"
              subheading={`${plural(sample.size, "product")} checked`}
            >
              <ScoreGauge
                score={sample.averageScore}
                label="Average product health"
              />
            </Card>
            <Card
              heading="Health by area"
              subheading="Average points earned out of each area's maximum"
            >
              <HorizontalBarChart
                label="Average score by area"
                max={100}
                items={sample.groupAverages.map((g) => {
                  const percent = Math.round((g.earned / g.weight) * 100);
                  return {
                    key: g.id,
                    label: g.label,
                    value: percent,
                    tone: scoreTone(percent),
                    valueText: `${formatNumber(g.earned)} / ${g.weight} pts`,
                  };
                })}
              />
            </Card>
          </SplitGrid>
        )}

        {sample && (
          <SplitGrid ratio="1:1">
            <Card
              heading="Score distribution"
              subheading="Products per health-score band"
            >
              <Histogram
                counts={sample.scoreBuckets}
                emptyAction={{
                  label: "Add a product",
                  href: "shopify://admin/products/new",
                }}
              />
            </Card>
            <Card
              heading="Inventory risk"
              subheading={
                inventory?.available
                  ? `${plural(inventory.sampleSize, "variant")} by stock level`
                  : undefined
              }
              action={{ label: "View inventory", href: "/app/inventory" }}
            >
              {inventory?.available ? (
                <DonutChart
                  label="Variants by inventory risk"
                  totalLabel="variants"
                  emptyMessage="No variants to check yet."
                  segments={RISK_ORDER.map((risk) => ({
                    key: risk,
                    label: RISK_LABELS[risk],
                    value: inventory.counts[risk],
                    tone: RISK_TONES[risk],
                  }))}
                />
              ) : (
                <s-text color="subdued">
                  {inventory?.reason === "access_denied"
                    ? "Approve inventory access to see stock risk."
                    : "Inventory couldn't be loaded right now."}
                </s-text>
              )}
            </Card>
          </SplitGrid>
        )}

        {sample && (
          <SplitGrid ratio="1:1">
            <Card
              heading="Top issues"
              subheading="Products affected by each issue"
            >
              <HorizontalBarChart
                label="Top issues by products affected"
                emptyMessage="No issues found. Nice work."
                items={sample.topIssues.map((issue) => ({
                  key: issue.checkId,
                  label: issue.label,
                  value: issue.count,
                  valueText: plural(issue.count, "product"),
                  href: ISSUE_LINKS[issue.checkId] ?? "/app/products?issues=1",
                }))}
              />
            </Card>
            <Card
              heading="Orders per day"
              subheading={
                orders?.available
                  ? `Last ${plural(orders.perDay.length, "day")} · ${orders.timeZone} time`
                  : undefined
              }
              action={{ label: "View orders", href: "/app/orders" }}
            >
              {orders?.available ? (
                <ColumnChart
                  label={`Orders per day, last ${plural(orders.perDay.length, "day")}`}
                  valueLabel="Orders"
                  emptyMessage={`No orders in the last ${plural(orders.perDay.length, "day")}.`}
                  data={orders.perDay.map((d) => ({
                    key: d.date,
                    label: formatDay(d.date),
                    detail: formatDayLong(d.date),
                    value: d.count,
                  }))}
                />
              ) : (
                <s-text color="subdued">
                  {orders?.reason === "access_denied"
                    ? "Approve order access to see order trends."
                    : "Orders couldn't be loaded right now."}
                </s-text>
              )}
            </Card>
          </SplitGrid>
        )}

        {sample && (
          <DataCapNotice>
            Health is based on {plural(sample.size, "product")}
            {sample.capped
              ? ` (capped at ${formatNumber(HEALTH_SAMPLE_CAP)}, sorted by title)`
              : ""}
            . Order charts use the most recent orders Shopify returns.
          </DataCapNotice>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
