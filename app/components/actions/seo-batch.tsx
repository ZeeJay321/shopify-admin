import { useState } from "react";
import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import { describeSeoBatch } from "../../lib/actions";
import { SEO_BATCH_MAX } from "../../lib/config";
import { BulkResults } from "./bulk-dialog";
import { BeforeAfter, ResultBanner } from "./shared";

export const SEO_BATCH_MODAL = "seo-batch-modal";

/** Button + dialog for a fixed set of products. */
export function SeoBatchAction({ productIds }: { productIds: string[] }) {
  const count = Math.min(productIds.length, SEO_BATCH_MAX);
  return (
    <>
      <s-button commandFor={SEO_BATCH_MODAL} command="--show">
        Apply suggested SEO ({count} product{count === 1 ? "" : "s"})
      </s-button>
      <SeoBatchDialog modalId={SEO_BATCH_MODAL} productIds={productIds} />
    </>
  );
}

/**
 * "Missing SEO" batch: preview (server plans suggestions for up to
 * SEO_BATCH_MAX products, filling only missing fields) -> summary dialog ->
 * confirm -> per-product results. Not all-or-nothing. The preview reloads
 * every time the dialog opens, for whichever products are passed in then.
 */
export function SeoBatchDialog({
  modalId,
  productIds,
}: {
  modalId: string;
  productIds: readonly string[];
}) {
  const [session, setSession] = useState(0);
  const preview = useFetcher<WriteActionResult>({ key: `${modalId}-preview` });
  const apply = useFetcher<WriteActionResult>({
    key: `${modalId}-apply-${session}`,
  });
  const ids = productIds.slice(0, SEO_BATCH_MAX);

  const items =
    preview.data?.ok && preview.data.preview
      ? preview.data.preview.filter((i) => i.valid)
      : [];
  const applied = apply.data;

  const loadPreview = () => {
    setSession((n) => n + 1);
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
      <s-modal
        id={modalId}
        heading="Apply suggested SEO"
        size="large"
        onShow={loadPreview}
      >
        <s-stack gap="base">
          {preview.state !== "idle" && (
            <s-spinner accessibilityLabel="Loading suggestions" />
          )}
          {preview.data && !preview.data.ok && (
            <ResultBanner result={preview.data} />
          )}
          {applied && !applied.ok && <ResultBanner result={applied} />}

          {applied?.ok && applied.results ? (
            <BulkResults results={applied.results} />
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
          <s-button slot="primary-action" commandFor={modalId} command="--hide">
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
            commandFor={modalId}
            command="--hide"
          >
            Cancel
          </s-button>
        )}
      </s-modal>
    </>
  );
}
