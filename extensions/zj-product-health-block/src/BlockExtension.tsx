import "@shopify/ui-extensions/preact";
import { render } from "preact";
import type { HealthSummaryResponse } from "../../../app/lib/product-health-api/contract";
import type { HealthViewState } from "../../../app/lib/product-health-api/view-model";
import {
  badgeTone,
  groupTone,
  reportHref,
} from "../../../app/lib/product-health-api/view-model";
import { useHealthView } from "../../shared/use-health-view";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n, data } = shopify;
  const { state, retry } = useHealthView(data.selected[0]?.id ?? null);

  return (
    <s-admin-block
      heading={i18n.translate("name")}
      collapsedSummary={collapsedSummary(state)}
    >
      <BlockBody state={state} retry={retry} />
    </s-admin-block>
  );
}

function collapsedSummary(state: HealthViewState): string {
  const { i18n } = shopify;
  if (state.kind === "ready" || state.kind === "healthy") {
    return i18n.translate("score", { score: state.summary.score });
  }
  return "";
}

function BlockBody({
  state,
  retry,
}: {
  state: HealthViewState;
  retry: () => void;
}) {
  const { i18n } = shopify;

  switch (state.kind) {
    case "loading":
      return (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-spinner accessibilityLabel={i18n.translate("loading")} />
          <s-text color="subdued">{i18n.translate("loading")}</s-text>
        </s-stack>
      );
    case "unavailable":
      return (
        <s-text color="subdued">
          {state.message ?? i18n.translate("unavailable")}
        </s-text>
      );
    case "session_expired":
      return (
        <s-banner tone="warning">{i18n.translate("sessionExpired")}</s-banner>
      );
    case "error":
      return (
        <s-stack gap="small-200">
          <s-banner
            tone="critical"
            heading={state.title ?? i18n.translate("errorTitle")}
          >
            {state.message ?? i18n.translate("errorMessage")}
          </s-banner>
          {state.retryable && (
            <s-button onClick={retry}>{i18n.translate("retry")}</s-button>
          )}
        </s-stack>
      );
    case "ready":
    case "healthy":
      return <Summary summary={state.summary} />;
  }
}

function Summary({ summary }: { summary: HealthSummaryResponse }) {
  const { i18n } = shopify;

  return (
    <s-stack gap="small-200">
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

      <s-stack direction="inline" gap="small-300">
        {summary.groups.map((group) => (
          <s-badge key={group.id} tone={groupTone(group.status)}>
            {group.label}
          </s-badge>
        ))}
      </s-stack>

      {summary.topIssues.length > 0 && (
        <s-unordered-list>
          {summary.topIssues.map((issue) => (
            <s-list-item key={issue.id}>
              {issue.label}: {issue.message}
            </s-list-item>
          ))}
        </s-unordered-list>
      )}

      <s-link href={reportHref(summary.reportPath)}>
        {i18n.translate("viewReport")}
      </s-link>
    </s-stack>
  );
}
