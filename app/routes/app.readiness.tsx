import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appCache } from "../lib/cache/index.server";
import { loadReadiness } from "../lib/services/readiness.server";
import {
  readinessActionHandlers,
  runWriteAction,
} from "../lib/services/actions/index.server";
import type { WriteActionResult } from "../lib/actions";
import { writeAccess } from "../lib/shopify/scopes";
import { SeoBatchAction } from "../components/actions/seo-batch";
import { WriteAccessBanner } from "../components/actions/shared";
import { toLoaderError } from "../lib/shopify/errors";
import type { CheckResult } from "../lib/storefront-readiness";
import { READINESS_GROUPS } from "../lib/storefront-readiness";
import {
  checkSeverityTone,
  enumLabel,
  formatNumber,
  plural,
  readinessVerdict,
} from "../lib/presentation";
import {
  CheckRow,
  DataCapNotice,
  EmptyState,
  ErrorState,
  LiveRegion,
  ScoreIndicator,
} from "../components/ui";

/** Storefront Readiness: weighted checks over products and collections. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const canWrite = writeAccess(session.scope).products;
  try {
    return {
      error: null,
      report: await loadReadiness(admin, session.shop, appCache),
      canWrite,
    };
  } catch (error) {
    return { error: toLoaderError(error), report: null, canWrite };
  }
};

/**
 * POST only. recheck: clears this app's cached report (no Shopify write).
 * preview_seo_batch / apply_seo_batch: confirmed SEO fixes (write_products).
 */
export const action = ({ request }: ActionFunctionArgs) =>
  runWriteAction(request, {
    authenticate: authenticate.admin,
    cache: appCache,
    handlers: readinessActionHandlers,
  });

const SEO_CHECK_IDS = new Set(["seo_titles", "seo_descriptions"]);

export default function StorefrontReadiness() {
  const { error, report, canWrite } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<WriteActionResult>();
  const navigation = useNavigation();
  const busy = fetcher.state !== "idle" || navigation.state === "loading";

  const missingSeoIds = report
    ? [
        ...new Set(
          report.checks
            .filter((c) => SEO_CHECK_IDS.has(c.id))
            .flatMap((c) => c.affectedResources)
            .filter((r) => r.kind === "product")
            .map((r) => r.id),
        ),
      ]
    : [];
  const openChecks = report
    ? report.checks.filter((c) => c.status === "warn" || c.status === "fail")
        .length
    : 0;
  const verdict = report ? readinessVerdict(report.score, openChecks) : null;

  return (
    <s-page heading="Storefront readiness">
      <s-link slot="breadcrumb-actions" href="/app">
        Store health
      </s-link>
      <s-button
        slot="secondary-actions"
        loading={busy}
        onClick={() =>
          fetcher.submit({ intent: "recheck" }, { method: "post" })
        }
      >
        Recheck now
      </s-button>

      {error && <ErrorState error={error} />}
      {fetcher.data?.ok && fetcher.state === "idle" && (
        <LiveRegion>
          <s-text accessibilityVisibility="exclusive">
            {fetcher.data.message}
          </s-text>
        </LiveRegion>
      )}

      {report && verdict && (
        <s-section>
          {report.score === null ? (
            <EmptyState
              icon="product"
              heading="Nothing to check yet"
              body="Add and activate products to see how ready your storefront is."
              action={{
                label: "Add product",
                href: "shopify://admin/products/new",
              }}
            />
          ) : (
            <s-stack gap="base">
              <ScoreIndicator score={report.score} label="Readiness score" />
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={verdict.tone}>
                  {openChecks === 0 ? "Ready" : `${openChecks} to fix`}
                </s-badge>
                <s-text type="strong">{verdict.text}</s-text>
              </s-stack>
              <DataCapNotice>
                Based on {plural(report.productCount, "product")} (
                {formatNumber(report.liveProductCount)} active)
                {report.productsCapped ? ", capped" : ""}
                {report.collectionCount === null
                  ? "; collections couldn't be loaded"
                  : ` and ${plural(report.collectionCount, "collection")}${report.collectionsCapped ? " (capped)" : ""}`}
                . Publishing is checked against the Online Store channel.
                Collection-only changes refresh within 10 minutes, or use
                Recheck now.
              </DataCapNotice>
            </s-stack>
          )}
        </s-section>
      )}

      {report &&
        report.score !== null &&
        READINESS_GROUPS.map((group) => {
          const checks = report.checks.filter((c) => c.group === group.id);
          if (checks.length === 0) return null;
          const open = checks.filter(
            (c) => c.status === "warn" || c.status === "fail",
          ).length;
          return (
            <s-section key={group.id} heading={group.label}>
              <s-stack gap="base">
                <s-text color="subdued">
                  {open === 0
                    ? `All ${checks.length} checks pass`
                    : `${open} of ${checks.length} checks need work`}
                </s-text>
                {checks.map((check) => (
                  <ReadinessCheck key={check.id} check={check} />
                ))}
                {group.id === "seo" && missingSeoIds.length > 0 && (
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    {canWrite ? (
                      <s-stack gap="small-200">
                        <s-heading>Fix missing SEO in bulk</s-heading>
                        <s-text color="subdued">
                          Fill in suggested SEO titles and descriptions for up
                          to 10 products. Only missing fields are filled; you
                          review every change first.
                        </s-text>
                        <s-stack direction="inline">
                          <SeoBatchAction productIds={missingSeoIds} />
                        </s-stack>
                      </s-stack>
                    ) : (
                      <WriteAccessBanner action="apply suggested SEO" />
                    )}
                  </s-box>
                )}
              </s-stack>
            </s-section>
          );
        })}
    </s-page>
  );
}

function ReadinessCheck({ check }: { check: CheckResult }) {
  return (
    <CheckRow
      status={check.status}
      label={check.name}
      message={check.description}
      meta={
        <>
          <s-badge tone={checkSeverityTone(check.severity, check.status)}>
            {enumLabel(check.severity)}
          </s-badge>
          {check.affectedCount > 0 && (
            <s-text color="subdued">{`${formatNumber(check.affectedCount)} affected`}</s-text>
          )}
        </>
      }
    >
      {check.affectedResources.length > 0 && (
        <details>
          <summary>
            <s-text>
              {check.affectedCount > check.affectedResources.length
                ? `Show first ${check.affectedResources.length} of ${formatNumber(check.affectedCount)}`
                : `Show ${plural(check.affectedCount, "affected item")}`}
            </s-text>
          </summary>
          <s-box paddingBlockStart="small-200">
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
          </s-box>
        </details>
      )}
    </CheckRow>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
