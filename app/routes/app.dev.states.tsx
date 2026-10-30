import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ShopifyApiError, toMerchantMessage } from "../lib/shopify/errors";
import {
  BeforeAfter,
  CharCounter,
  ResultBanner,
} from "../components/actions/shared";
import {
  CardGrid,
  CheckRow,
  DataCapNotice,
  EmptyState,
  ErrorState,
  LabeledProgress,
  MetricCard,
  PageSkeleton,
  PermissionBanner,
  ProportionBars,
  RiskBadge,
  ScoreIndicator,
  SeverityBadge,
  StatusBadge,
  TableSkeleton,
} from "../components/ui";

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

      <s-section heading="Scores and metrics">
        <s-stack gap="base">
          <CardGrid>
            <MetricCard
              label="Products"
              value="1,250"
              subtext="1,200 active · 50 draft"
              href="/app/products"
              linkLabel="View products"
            />
            <MetricCard
              label="Needs attention"
              value="8"
              tone="critical"
              toneLabel="Review"
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
          <CardGrid columns={3}>
            <ScoreIndicator score={92} />
            <ScoreIndicator score={64} />
            <ScoreIndicator score={31} />
          </CardGrid>
          <s-stack direction="inline" gap="base">
            <ScoreIndicator score={92} size="compact" />
            <ScoreIndicator score={null} />
          </s-stack>
          <LabeledProgress label="Content" value={24} max={30} tone="success" />
          <ProportionBars
            total={500}
            segments={[
              { key: "c", label: "Critical", value: 13, tone: "critical" },
              { key: "l", label: "Low stock", value: 2, tone: "warning" },
              { key: "h", label: "Healthy", value: 485, tone: "success" },
            ]}
          />
          <DataCapNotice>
            Based on 250 products (capped at 250, sorted by title).
          </DataCapNotice>
        </s-stack>
      </s-section>

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
          <PageSkeleton />
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
