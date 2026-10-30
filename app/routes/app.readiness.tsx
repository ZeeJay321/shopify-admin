import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import { HEALTH_SAMPLE_CAP } from "../lib/config";
import { scoreTone } from "../lib/product-health";
import {
  invalidateReadiness,
  loadReadiness,
} from "../lib/services/readiness.server";
import { toLoaderError } from "../lib/shopify/errors";
import type { CheckResult } from "../lib/storefront-readiness";
import { READINESS_GROUPS } from "../lib/storefront-readiness";
import { CheckStatusIcon, ErrorBanner } from "../components/health-ui";

/** Storefront Readiness: weighted checks over products and collections. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    return {
      error: null,
      report: await loadReadiness(admin, session.shop, appCache),
    };
  } catch (error) {
    return { error: toLoaderError(error), report: null };
  }
};

/** "Recheck now": clears only this app's cached report (no Shopify writes). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  invalidateReadiness(session.shop, appCache);
  return { rechecked: true };
};

const SEVERITY_TONE = {
  critical: "critical",
  warning: "warning",
  info: "info",
} as const;

export default function StorefrontReadiness() {
  const { error, report } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const busy = fetcher.state !== "idle" || navigation.state === "loading";

  return (
    <s-page heading="Storefront Readiness">
      <s-link slot="breadcrumb-actions" href="/app">
        Store Health
      </s-link>
      <s-button
        slot="primary-action"
        loading={busy}
        onClick={() => fetcher.submit({}, { method: "post" })}
      >
        Recheck now
      </s-button>

      {error && <ErrorBanner error={error} />}

      {report && (
        <s-section heading="Overall">
          <s-stack gap="small-200">
            {report.score === null ? (
              <s-paragraph>
                Nothing to check yet. Add and activate products to see
                storefront readiness.
              </s-paragraph>
            ) : (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={scoreTone(report.score)}>
                  {report.score} / 100
                </s-badge>
                <s-text color="subdued">
                  Weighted across{" "}
                  {
                    report.checks.filter((c) => c.status !== "not_applicable")
                      .length
                  }{" "}
                  checks.
                </s-text>
              </s-stack>
            )}
            <s-text color="subdued">
              Based on {report.productCount} product
              {report.productCount === 1 ? "" : "s"} ({report.liveProductCount}{" "}
              active)
              {report.productsCapped ? `, capped at ${HEALTH_SAMPLE_CAP}` : ""}
              {report.collectionCount === null
                ? "; collections unavailable"
                : ` and ${report.collectionCount} collection${report.collectionCount === 1 ? "" : "s"}${report.collectionsCapped ? " (capped)" : ""}`}
              . Publishing is checked against the Online Store channel.
              Collection-only changes refresh within 10 minutes, or use Recheck
              now.
            </s-text>
          </s-stack>
        </s-section>
      )}

      {report &&
        READINESS_GROUPS.map((group) => {
          const checks = report.checks.filter((c) => c.group === group.id);
          if (checks.length === 0) return null;
          return (
            <s-section key={group.id} heading={group.label}>
              <s-stack gap="base">
                {checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </s-stack>
            </s-section>
          );
        })}
    </s-page>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <s-stack gap="small-200">
      <s-stack direction="inline" gap="small" alignItems="center">
        {check.status === "not_applicable" ? (
          <s-badge tone="neutral">N/A</s-badge>
        ) : (
          <CheckStatusIcon status={check.status} />
        )}
        <s-text type="strong">{check.name}</s-text>
        <s-badge tone={SEVERITY_TONE[check.severity]}>{check.severity}</s-badge>
        {check.affectedCount > 0 && (
          <s-text color="subdued">{check.affectedCount} affected</s-text>
        )}
      </s-stack>
      <s-text color="subdued">{check.description}</s-text>
      {check.affectedResources.length > 0 && (
        <details>
          <summary>
            Show affected
            {check.affectedCount > check.affectedResources.length
              ? ` (first ${check.affectedResources.length} of ${check.affectedCount})`
              : ""}
          </summary>
          <s-unordered-list>
            {check.affectedResources.map((r) => (
              <s-list-item key={`${r.kind}-${r.id}`}>
                {r.kind === "product" ? (
                  <s-link href={`/app/products/${r.id}`}>{r.title}</s-link>
                ) : (
                  <s-link
                    href={`shopify://admin/collections/${r.id}`}
                    target="_top"
                  >
                    {r.title}
                  </s-link>
                )}
              </s-list-item>
            ))}
          </s-unordered-list>
        </details>
      )}
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
