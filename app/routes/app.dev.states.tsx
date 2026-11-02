import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ShopifyApiError, toMerchantMessage } from "../lib/shopify/errors";
import {
  Acknowledgement,
  BeforeAfter,
  CharCounter,
  ResultBanner,
  StepHeader,
} from "../components/actions/shared";
import {
  Callout,
  Card,
  CardGrid,
  CheckRow,
  DataCapNotice,
  EmptyState,
  ErrorState,
  PageSkeleton,
  PermissionBanner,
  RiskBadge,
  SeverityBadge,
  SplitGrid,
  StatusBadge,
  TableSkeleton,
} from "../components/ui";
import {
  ColumnChart,
  DonutChart,
  Histogram,
  HorizontalBarChart,
  InlineScoreBar,
  MetricCard,
  ScoreGauge,
  StackedProportionBar,
} from "../components/charts";

// Fixture values for this dev gallery only; real pages use loader data.
const DEMO_DAYS = [3, 5, 2, 0, 7, 4, 6, 9, 1, 3, 5, 8, 2, 4].map(
  (value, i) => ({
    key: `d${i}`,
    label: `Oct ${17 + i}`,
    detail: `Oct ${17 + i}`,
    value,
  }),
);
const DEMO_RISK = [
  { key: "critical", label: "Critical", value: 13, tone: "critical" },
  { key: "low", label: "Low stock", value: 22, tone: "warning" },
  { key: "healthy", label: "Healthy", value: 440, tone: "success" },
  { key: "untracked", label: "Not tracked", value: 25, tone: "neutral" },
] as const;

/**
 * DEV ONLY: a gallery of every page state (empty, loading, error,
 * permission, feedback) so they can be reviewed without breaking a store.
 * Returns 404 in production builds.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not found", { status: 404 });
  }
  await authenticate.admin(request);
  return {
    errors: {
      throttled: toMerchantMessage(
        new ShopifyApiError("throttled", "dev", "demo"),
      ),
      failed: toMerchantMessage(new ShopifyApiError("http", "dev", "demo")),
    },
  };
};

export default function DevStates() {
  return (
    <s-page heading="UI states (dev only)">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>

      <s-section heading="Color tokens">
        <TokenCheck />
      </s-section>

      <s-stack gap="base">
        <Callout
          heading="Fix missing images"
          body="12 products have too few images."
          action={{ label: "See affected products", href: "/app/readiness" }}
        />
        <CardGrid>
          <MetricCard
            label="Products"
            value="1,250"
            tone="info"
            href="/app/products"
            linkLabel="View products"
          >
            <StackedProportionBar
              label="Products by status"
              size="thin"
              segments={[
                { key: "a", label: "Active", value: 1200, tone: "success" },
                { key: "d", label: "Draft", value: 50, tone: "info" },
              ]}
            />
          </MetricCard>
          <MetricCard
            label="Needs attention"
            value="8"
            tone="critical"
            toneLabel="3 high"
            trend={DEMO_DAYS.map((d) => d.value)}
            trendLabel="Orders per day, last 14 days"
          />
          <MetricCard
            label="All clear"
            value="0"
            tone="success"
            toneLabel="All clear"
          />
          <MetricCard
            label="Unavailable"
            value="—"
            subtext="Approve order access to see this."
          />
        </CardGrid>

        <SplitGrid ratio="1:2">
          <Card heading="ScoreGauge">
            <CardGrid columns={3}>
              <ScoreGauge score={92} label="Demo" size="small" />
              <ScoreGauge score={64} label="Demo" size="small" />
              <ScoreGauge score={0} label="Demo" size="small" />
            </CardGrid>
            <ScoreGauge score={100} label="Demo" size="medium" />
            <ScoreGauge score={null} label="Demo" />
          </Card>
          <Card heading="HorizontalBarChart" subheading="Tones, links, empty">
            <HorizontalBarChart
              label="Demo bars"
              max={100}
              items={[
                {
                  key: "c",
                  label: "Content",
                  value: 90,
                  tone: "success",
                  valueText: "27 / 30 pts",
                },
                {
                  key: "s",
                  label: "SEO",
                  value: 55,
                  tone: "warning",
                  valueText: "11 / 20 pts",
                },
                {
                  key: "i",
                  label:
                    "A very long label that has to wrap on narrow embedded widths without overflowing",
                  value: 20,
                  tone: "critical",
                  href: "/app/inventory",
                },
              ]}
            />
            <HorizontalBarChart
              label="Empty"
              items={[]}
              emptyMessage="No issues found. Nice work."
            />
          </Card>
        </SplitGrid>

        <SplitGrid ratio="1:1">
          <Card heading="Histogram">
            <Histogram counts={[4, 9, 21, 60, 156]} />
            <Histogram counts={[0, 0, 0, 0, 0]} />
          </Card>
          <Card heading="DonutChart">
            <DonutChart
              label="Demo risk"
              totalLabel="variants"
              segments={DEMO_RISK}
            />
            <DonutChart
              label="Single segment"
              totalLabel="variants"
              segments={[
                { key: "h", label: "Healthy", value: 10, tone: "success" },
              ]}
            />
            <DonutChart label="Empty" totalLabel="variants" segments={[]} />
          </Card>
        </SplitGrid>

        <SplitGrid ratio="2:1">
          <Card
            heading="ColumnChart"
            subheading="Hover or focus and use arrow keys"
          >
            <ColumnChart
              label="Demo orders per day"
              valueLabel="Orders"
              data={DEMO_DAYS}
            />
            <ColumnChart
              label="One day"
              valueLabel="Orders"
              data={DEMO_DAYS.slice(0, 1)}
            />
            <ColumnChart
              label="Empty"
              valueLabel="Orders"
              data={[]}
              emptyMessage="No orders in the last 14 days."
            />
          </Card>
          <Card heading="StackedProportionBar and InlineScoreBar">
            <StackedProportionBar label="Demo risk" segments={DEMO_RISK} />
            <StackedProportionBar
              label="Empty"
              segments={[]}
              emptyMessage="No recent orders."
            />
            <InlineScoreBar score={92} />
            <InlineScoreBar score={64} />
            <InlineScoreBar score={12} />
          </Card>
        </SplitGrid>

        <DataCapNotice>
          Based on 250 products (capped at 250, sorted by title).
        </DataCapNotice>
      </s-stack>

      <s-section heading="Badges">
        <s-stack direction="inline" gap="small-200">
          <StatusBadge status="ACTIVE" />
          <StatusBadge status="DRAFT" />
          <StatusBadge status="PAID" />
          <StatusBadge status="PARTIALLY_FULFILLED" />
          <RiskBadge risk="critical" />
          <RiskBadge risk="low" />
          <SeverityBadge severity="HIGH" />
          <SeverityBadge severity="LOW" />
        </s-stack>
      </s-section>

      <s-section heading="Check rows">
        <s-stack gap="base">
          <CheckRow status="pass" label="Title" message="Title is set." />
          <CheckRow
            status="warn"
            label="Images"
            message="Only 1 image; 3+ recommended."
            fix="Products → open the product → Media → Add images."
            action={<s-button>Fix</s-button>}
          />
          <CheckRow
            status="fail"
            label="SEO description"
            message="No SEO meta description set."
            fix="Products → Search engine listing → Edit."
          />
          <CheckRow
            status="not_applicable"
            label="Collections"
            message="Collections couldn't be loaded."
          />
        </s-stack>
      </s-section>

      <s-section heading="Empty states">
        <s-stack gap="base">
          <EmptyState
            icon="product"
            heading="No products yet"
            body="Add products in Shopify Admin and they'll be scored here."
            action={{
              label: "Add product",
              href: "shopify://admin/products/new",
            }}
          />
          <EmptyState
            heading="No products match these filters"
            body="Try a different status."
            action={{ label: "Clear filters", href: "/app/products" }}
          />
        </s-stack>
      </s-section>

      <s-section heading="Loading">
        <s-stack gap="base">
          <TableSkeleton rows={3} />
          <PageSkeleton variant="dashboard" />
          <PageSkeleton variant="table" />
          <PageSkeleton variant="detail" />
          <PageSkeleton variant="readiness" />
        </s-stack>
      </s-section>

      <s-section heading="Errors and permissions">
        <s-stack gap="base">
          <ErrorStateDemo />
          <PermissionBanner
            kind="read"
            feature="inventory risk"
            scopes={["read inventory", "read locations"]}
          />
          <PermissionBanner
            kind="write"
            feature="adjust stock"
            scopes={["update inventory"]}
          />
        </s-stack>
      </s-section>

      <s-section heading="Action feedback">
        <s-stack gap="base">
          <ResultBanner
            result={{
              ok: true,
              intent: "update_seo",
              message: 'SEO updated for "Organic Hoodie".',
            }}
          />
          <ResultBanner
            result={{
              ok: false,
              intent: "adjust_inventory",
              code: "conflict",
              message:
                "This changed in Shopify since you opened it. Review the current values and try again.",
            }}
          />
          <ResultBanner
            result={{
              ok: false,
              intent: "update_seo",
              code: "permission_needed",
              message: "The app needs permission to make changes.",
            }}
          />
          <StepHeader
            step={1}
            of={2}
            title="Edit the search listing"
            detail="For Organic Hoodie."
          />
          <Acknowledgement
            label="I understand these issues and want to publish anyway"
            checked={false}
            onChange={() => {}}
          />
          <CharCounter length={45} max={70} />
          <CharCounter length={66} max={70} />
          <CharCounter length={75} max={70} />
          <BeforeAfter
            rows={[
              { label: "SEO title", before: "", after: "Organic Hoodie | ZJ" },
            ]}
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}

/** Shows whether Polaris color tokens reach this iframe (else fallbacks). */
function TokenCheck() {
  const [resolved, setResolved] = useState<boolean | null>(null);
  useEffect(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--p-color-bg-fill-success")
      .trim();
    setResolved(value !== "");
  }, []);
  if (resolved === null) return <s-text color="subdued">Checking…</s-text>;
  return (
    <s-text>
      {resolved
        ? "Polaris color tokens are available; charts use them."
        : "Polaris color tokens aren't exposed here; charts use the fallback palette in charts.css."}
    </s-text>
  );
}

function ErrorStateDemo() {
  return (
    <ErrorState
      error={{
        kind: "throttled",
        title: "Shopify is busy",
        message:
          "Your store's API limit was reached while loading products. Wait a few seconds and reload the page.",
      }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
