import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import { describeSeoBatch } from "../../lib/actions";
import { SEO_BATCH_MAX } from "../../lib/config";
import { BeforeAfter, ResultBanner } from "./shared";

const BATCH_MODAL = "seo-batch-modal";

/**
 * Readiness "missing SEO" batch: preview (server plans suggestions for up to
 * SEO_BATCH_MAX products, filling only missing fields) -> summary dialog ->
 * confirm -> per-product results. Not all-or-nothing.
 */
export function SeoBatchAction({ productIds }: { productIds: string[] }) {
  const preview = useFetcher<WriteActionResult>();
  const apply = useFetcher<WriteActionResult>();
  const ids = productIds.slice(0, SEO_BATCH_MAX);

  const items =
    preview.data?.ok && preview.data.preview
      ? preview.data.preview.filter((i) => i.valid)
      : [];
  const applied = apply.data;

  const loadPreview = () => {
    const form = new FormData();
    form.set("intent", "preview_seo_batch");
    for (const id of ids) form.append("productId", id);
    preview.submit(form, { method: "post" });
  };

  const confirm = () =>
    apply.submit(
      {
        intent: "apply_seo_batch",
        confirm: "yes",
        items: JSON.stringify(
          items.map((i) => ({
            productId: i.productId,
            productTitle: i.productTitle,
            title: i.values.title,
            description: i.values.description,
            expectedTitle: i.expected.title,
            expectedDescription: i.expected.description,
          })),
        ),
      },
      { method: "post" },
    );

  return (
    <>
      <s-button commandFor={BATCH_MODAL} command="--show" onClick={loadPreview}>
        Apply suggested SEO ({ids.length} product{ids.length === 1 ? "" : "s"})
      </s-button>

      <s-modal id={BATCH_MODAL} heading="Apply suggested SEO" size="large">
        <s-stack gap="base">
          {preview.state !== "idle" && (
            <s-spinner accessibilityLabel="Loading suggestions" />
          )}
          {preview.data && !preview.data.ok && (
            <ResultBanner result={preview.data} />
          )}
          {applied && <ResultBanner result={applied} />}

          {applied?.ok && applied.results ? (
            <s-unordered-list>
              {applied.results.map((r) => (
                <s-list-item key={r.productId}>
                  {r.ok ? "✓" : "✗"} {r.productTitle}: {r.message}
                </s-list-item>
              ))}
            </s-unordered-list>
          ) : (
            preview.state === "idle" &&
            items.length > 0 && (
              <>
                <s-paragraph>
                  <s-text type="strong">
                    {describeSeoBatch(items.length)}
                  </s-text>{" "}
                  Only missing SEO fields are filled; existing values are kept.
                  Products that changed since this preview are skipped.
                </s-paragraph>
                {items.map((item) => (
                  <s-stack key={item.productId} gap="small-200">
                    <s-text type="strong">{item.productTitle}</s-text>
                    <BeforeAfter
                      rows={[
                        { label: "SEO title", ...item.summary.title },
                        {
                          label: "SEO description",
                          ...item.summary.description,
                        },
                      ]}
                    />
                  </s-stack>
                ))}
              </>
            )
          )}
          {preview.data?.ok && items.length === 0 && (
            <s-paragraph>
              No suggestions to apply for these products.
            </s-paragraph>
          )}
        </s-stack>

        {applied?.ok ? (
          <s-button
            slot="primary-action"
            commandFor={BATCH_MODAL}
            command="--hide"
          >
            Done
          </s-button>
        ) : (
          <s-button
            slot="primary-action"
            variant="primary"
            disabled={items.length === 0 || preview.state !== "idle"}
            loading={apply.state !== "idle"}
            onClick={confirm}
          >
            Confirm {items.length} update{items.length === 1 ? "" : "s"}
          </s-button>
        )}
        {!applied?.ok && (
          <s-button
            slot="secondary-actions"
            commandFor={BATCH_MODAL}
            command="--hide"
          >
            Cancel
          </s-button>
        )}
      </s-modal>
    </>
  );
}
