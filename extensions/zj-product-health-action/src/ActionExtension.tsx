import "@shopify/ui-extensions/preact";
import { render } from "preact";
import type { HealthSummaryResponse } from "../../../app/lib/product-health-api/contract";
import type { HealthViewState } from "../../../app/lib/product-health-api/view-model";
import {
  badgeTone,
  reportHref,
} from "../../../app/lib/product-health-api/view-model";
import { useHealthView } from "../../shared/use-health-view";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n, data, close } = shopify;
  const { state, retry } = useHealthView(data.selected[0]?.id ?? null);
  const summary =
    state.kind === "ready" || state.kind === "healthy" ? state.summary : null;

  return (
    <s-admin-action
      heading={i18n.translate("name")}
      loading={state.kind === "loading"}
    >
      <ActionBody state={state} />

      {summary ? (
        <s-button
          slot="primary-action"
          variant="primary"
          href={reportHref(summary.reportPath)}
        >
          {i18n.translate("openReport")}
        </s-button>
      ) : state.kind === "error" && state.retryable ? (
        <s-button slot="primary-action" onClick={retry}>
          {i18n.translate("retry")}
        </s-button>
      ) : null}
      <s-button slot="secondary-actions" onClick={() => close()}>
        {i18n.translate("close")}
      </s-button>
    </s-admin-action>
  );
}

function ActionBody({ state }: { state: HealthViewState }) {
  const { i18n } = shopify;

  switch (state.kind) {
    case "loading":
      return (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-spinner accessibilityLabel={i18n.translate("running")} />
          <s-text>{i18n.translate("running")}</s-text>
        </s-stack>
      );
    case "unavailable":
      return <s-text>{state.message ?? i18n.translate("unavailable")}</s-text>;
    case "session_expired":
      return (
        <s-banner tone="warning">{i18n.translate("sessionExpired")}</s-banner>
      );
    case "error":
      // Retry lives in the primary-action slot.
      return (
        <s-banner
          tone="critical"
          heading={state.title ?? i18n.translate("errorTitle")}
        >
          {state.message ?? i18n.translate("errorMessage")}
        </s-banner>
      );
    case "ready":
    case "healthy":
      return <Result summary={state.summary} />;
  }
}

function Result({ summary }: { summary: HealthSummaryResponse }) {
  const { i18n } = shopify;

  return (
    <s-stack gap="base">
      <s-stack gap="small-200">
        <s-heading>{summary.product.title}</s-heading>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-badge tone={badgeTone(summary.scoreTone)}>
            {i18n.translate("score", { score: summary.score })}
          </s-badge>
          <s-text color="subdued">
            {summary.issueCount === 0
              ? i18n.translate("healthy")
              : i18n.translate("issueCount", { count: summary.issueCount })}
          </s-text>
        </s-stack>
      </s-stack>

      {summary.topIssues.length > 0 && (
        <s-stack gap="small-200">
          <s-text type="strong">{i18n.translate("topIssues")}</s-text>
          <s-unordered-list>
            {summary.topIssues.map((issue) => (
              <s-list-item key={issue.id}>
                {issue.label}: {issue.message}
              </s-list-item>
            ))}
          </s-unordered-list>
        </s-stack>
      )}
    </s-stack>
  );
}
