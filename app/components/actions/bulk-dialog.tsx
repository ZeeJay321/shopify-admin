/**
 * Bulk fix dialog (publish to a channel, activate drafts): summary ->
 * explicit confirm -> per-item results. Items run one by one on the server;
 * failures never undo successes.
 */

import { useState } from "react";
import { useFetcher } from "react-router";
import type {
  BatchOutcome,
  BulkKind,
  WriteActionResult,
} from "../../lib/actions";
import { describeBulk, summarizeBulk } from "../../lib/actions";
import { LiveRegion } from "../ui";
import { ResultBanner, StepHeader } from "./shared";

export type BulkTarget = {
  kind: BulkKind;
  items: Array<{ productId: string; productTitle: string }>;
  /** Required for publish. */
  channel?: { id: string; name: string };
};

const INTENTS: Record<BulkKind, string> = {
  publish: "publish_products",
  activate: "activate_products",
};

const PREVIEW_LIMIT = 10;

export function BulkFixDialog({
  modalId,
  target,
}: {
  modalId: string;
  target: BulkTarget | null;
}) {
  const [session, setSession] = useState(0);
  const fetcher = useFetcher<WriteActionResult>({
    key: `${modalId}-${session}`,
  });
  const result = fetcher.data;
  const submitting = fetcher.state !== "idle";
  const results = result?.ok ? result.results : undefined;
  const heading =
    target?.kind === "publish"
      ? `Publish to ${target.channel?.name ?? "sales channel"}`
      : "Activate products";

  const confirm = () => {
    if (!target) return;
    const form = new FormData();
    form.set("intent", INTENTS[target.kind]);
    form.set("confirm", "yes");
    if (target.channel) form.set("publicationId", target.channel.id);
    for (const item of target.items) {
      form.append("productId", item.productId);
      form.append("productTitle", item.productTitle);
    }
    fetcher.submit(form, { method: "post" });
  };

  return (
    <s-modal
      id={modalId}
      heading={heading}
      onShow={() => setSession((n) => n + 1)}
    >
      {target && (
        <s-stack gap="base">
          {result && !result.ok && <ResultBanner result={result} />}
          {results ? (
            <BulkResults results={results} />
          ) : (
            <>
              <StepHeader
                step={1}
                of={1}
                title="Review and confirm"
                detail={describeBulk(
                  target.kind,
                  target.items.length,
                  target.channel?.name,
                )}
              />
              <s-unordered-list>
                {target.items.slice(0, PREVIEW_LIMIT).map((item) => (
                  <s-list-item key={item.productId}>
                    {item.productTitle}
                  </s-list-item>
                ))}
              </s-unordered-list>
              {target.items.length > PREVIEW_LIMIT && (
                <s-text color="subdued">{`and ${target.items.length - PREVIEW_LIMIT} more`}</s-text>
              )}
              {target.kind === "activate" && (
                <s-text color="subdued">
                  Products with critical issues are skipped; open them to review
                  and publish one at a time.
                </s-text>
              )}
            </>
          )}
        </s-stack>
      )}

      {results ? (
        <s-button slot="primary-action" commandFor={modalId} command="--hide">
          Done
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          loading={submitting}
          disabled={!target || target.items.length === 0}
          onClick={confirm}
        >
          {target?.kind === "publish"
            ? `Publish ${target.items.length}`
            : `Activate ${target?.items.length ?? 0}`}
        </s-button>
      )}
      {!results && (
        <s-button
          slot="secondary-actions"
          commandFor={modalId}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}

/** Per-item outcome table, announced when it appears. */
export function BulkResults({ results }: { results: readonly BatchOutcome[] }) {
  const summary = summarizeBulk(results);
  return (
    <LiveRegion>
      <s-stack gap="base">
        <s-banner tone={summary.failed === 0 ? "success" : "warning"}>
          {summary.message}
        </s-banner>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header listSlot="inline">Result</s-table-header>
            <s-table-header>Details</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {results.map((r) => (
              <s-table-row key={r.productId}>
                <s-table-cell>{r.productTitle}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={r.ok ? "success" : "critical"}>
                    {r.ok ? "Done" : "Failed"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>{r.message}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </LiveRegion>
  );
}
