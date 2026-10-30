import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GROUPS, scoreProduct } from "../lib/product-health";
import { toLoaderError } from "../lib/shopify/errors";
import { toNumericId, toProductGid } from "../lib/shopify/gid";
import { getProduct } from "../lib/shopify/products.server";
import {
  CheckStatusIcon,
  ErrorBanner,
  ProductStatusBadge,
  ScoreBadge,
} from "../components/health-ui";

/** Product Health detail. Read-only: issues show manual fix steps. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const gid = toProductGid(params.id);
    const record = await getProduct(admin, gid);
    const health = scoreProduct(record.snapshot);
    return {
      error: null,
      product: {
        id: toNumericId(record.snapshot.id),
        title: record.snapshot.title || "(untitled)",
        status: record.snapshot.status,
        imageUrl: record.imageUrl,
        imageAlt: record.imageAlt,
      },
      health,
    };
  } catch (error) {
    return { error: toLoaderError(error), product: null, health: null };
  }
};

export default function ProductHealthDetail() {
  const { error, product, health } = useLoaderData<typeof loader>();

  if (error || !product || !health) {
    return (
      <s-page heading="Product Health">
        <s-link slot="breadcrumb-actions" href="/app/products">
          Product Health
        </s-link>
        {error && <ErrorBanner error={error} />}
        <s-section>
          <s-link href="/app/products">Back to Product Health</s-link>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={product.title}>
      <s-link slot="breadcrumb-actions" href="/app/products">
        Product Health
      </s-link>
      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-thumbnail
            src={product.imageUrl ?? undefined}
            alt={product.imageAlt ?? product.title}
            size="base"
          />
          <s-stack gap="small-200">
            <s-stack direction="inline" gap="small">
              <ScoreBadge score={health.score} />
              <ProductStatusBadge status={product.status} />
            </s-stack>
            <s-text color="subdued">
              {health.issues.length === 0
                ? "No issues found."
                : `${health.issues.length} issue${health.issues.length === 1 ? "" : "s"} to fix.`}
            </s-text>
            <s-link
              href={`shopify://admin/products/${product.id}`}
              target="_top"
            >
              View in Shopify Admin
            </s-link>
          </s-stack>
        </s-stack>
      </s-section>

      {health.issues.length > 0 && (
        <s-section heading="How to fix">
          <s-stack gap="base">
            {health.issues.map((issue) => (
              <s-stack key={issue.id} direction="inline" gap="small">
                <CheckStatusIcon status={issue.status} />
                <s-stack gap="small-300">
                  <s-text type="strong">
                    {issue.label}: {issue.message}
                  </s-text>
                  <s-text color="subdued">{issue.fix}</s-text>
                </s-stack>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {GROUPS.map((group) => {
        const checks = health.checks.filter((c) => c.group === group.id);
        const earned = checks.reduce((sum, c) => sum + c.earned, 0);
        return (
          <s-section
            key={group.id}
            heading={`${group.label} (${Math.round(earned)} / ${group.weight})`}
          >
            <s-stack gap="small">
              {checks.map((check) => (
                <s-stack
                  key={check.id}
                  direction="inline"
                  gap="small"
                  alignItems="center"
                >
                  <CheckStatusIcon status={check.status} />
                  <s-text type="strong">{check.label}</s-text>
                  <s-text color="subdued">{check.message}</s-text>
                </s-stack>
              ))}
            </s-stack>
          </s-section>
        );
      })}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
