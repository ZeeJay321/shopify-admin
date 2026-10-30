import { useState } from "react";
import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import {
  STATUS_TRANSITIONS,
  describeSeoChange,
  describeStatusChange,
  isEditableStatus,
  planSeoUpdate,
  planStatusChange,
} from "../../lib/actions";
import {
  MAX_SEO_DESCRIPTION_LENGTH,
  MAX_SEO_TITLE_LENGTH,
} from "../../lib/product-health";
import type { HealthCheck } from "../../lib/product-health/types";
import { enumLabel } from "../../lib/presentation";
import {
  BeforeAfter,
  CharCounter,
  ResultBanner,
  Warnings,
  fieldError,
} from "./shared";

export const SEO_MODAL_ID = "fix-seo-modal";
export const STATUS_MODAL_ID = "status-modal";

type Product = { id: string; title: string; status: string };
type Seo = { title: string; description: string };

/** The status a product can move to from here, or null (e.g. archived). */
export function nextStatus(status: string): "ACTIVE" | "DRAFT" | null {
  return isEditableStatus(status) ? STATUS_TRANSITIONS[status] : null;
}

export function statusActionLabel(next: "ACTIVE" | "DRAFT"): string {
  return next === "ACTIVE" ? "Publish" : "Move to draft";
}

/**
 * Fix SEO: step 1 edit (live counters, suggestion prefill), step 2 review
 * (Before / After) and confirm. Resets every time it opens.
 */
export function SeoModal({
  product,
  seo,
  suggestion,
}: {
  product: Product;
  seo: Seo;
  suggestion: Seo;
}) {
  const [session, setSession] = useState(0);
  const fetcher = useFetcher<WriteActionResult>({
    key: `seo-${product.id}-${session}`,
  });
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [title, setTitle] = useState(seo.title || suggestion.title);
  const [description, setDescription] = useState(
    seo.description || suggestion.description,
  );
  const [touched, setTouched] = useState({ title: false, description: false });

  const result = fetcher.data;
  const submitting = fetcher.state !== "idle";
  const done = result?.ok === true;
  const plan = planSeoUpdate({ current: seo, next: { title, description } });
  const showEdit =
    !done && (step === "edit" || (result !== undefined && !result.ok));

  const reset = () => {
    setSession((n) => n + 1);
    setStep("edit");
    setTitle(seo.title || suggestion.title);
    setDescription(seo.description || suggestion.description);
    setTouched({ title: false, description: false });
  };

  const confirm = () =>
    fetcher.submit(
      {
        intent: "update_seo",
        productId: product.id,
        title: plan.values.title,
        description: plan.values.description,
        expectedTitle: seo.title,
        expectedDescription: seo.description,
        confirm: "yes",
      },
      { method: "post" },
    );

  const rows = [
    { label: "SEO title", ...plan.summary.title },
    { label: "SEO description", ...plan.summary.description },
  ];
  const formError = fieldError(
    "form",
    plan.errors,
    result,
    touched.title || touched.description,
  );

  return (
    <s-modal id={SEO_MODAL_ID} heading="Fix SEO" size="large" onShow={reset}>
      <s-stack gap="base">
        <ResultBanner result={result} />
        {result &&
          !result.ok &&
          result.code === "conflict" &&
          result.current && (
            <s-paragraph>
              Shopify now has the title &quot;
              {String(result.current.title ?? "")}&quot; and description &quot;
              {String(result.current.description ?? "")}&quot;. Your edits are
              kept; review them and confirm again.
            </s-paragraph>
          )}

        {showEdit && (
          <>
            <s-text color="subdued">
              Step 1 of 2 · Edit the search listing for {product.title}.
              Suggestions are only a starting point.
            </s-text>
            <s-stack gap="small-300">
              <s-text-field
                label="SEO title"
                value={title}
                error={fieldError("title", plan.errors, result, touched.title)}
                onInput={(event) => {
                  setTitle(event.currentTarget.value);
                  setTouched((t) => ({ ...t, title: true }));
                }}
              />
              <CharCounter
                length={plan.values.title.length}
                max={MAX_SEO_TITLE_LENGTH}
              />
            </s-stack>
            <s-stack gap="small-300">
              <s-text-area
                label="SEO description"
                value={description}
                rows={3}
                error={fieldError(
                  "description",
                  plan.errors,
                  result,
                  touched.description,
                )}
                onInput={(event) => {
                  setDescription(event.currentTarget.value);
                  setTouched((t) => ({ ...t, description: true }));
                }}
              />
              <CharCounter
                length={plan.values.description.length}
                max={MAX_SEO_DESCRIPTION_LENGTH}
              />
            </s-stack>
            <s-stack direction="inline">
              <s-button
                variant="tertiary"
                icon="wand"
                onClick={() => {
                  setTitle(suggestion.title);
                  setDescription(suggestion.description);
                  setTouched({ title: true, description: true });
                }}
              >
                Use suggestion
              </s-button>
            </s-stack>
            {formError && <s-text tone="critical">{formError}</s-text>}
            <Warnings warnings={plan.warnings} />
          </>
        )}

        {!done && !showEdit && (
          <>
            <s-text color="subdued">Step 2 of 2 · Review and confirm</s-text>
            <s-paragraph>{describeSeoChange(product.title)}</s-paragraph>
            <BeforeAfter rows={rows} />
          </>
        )}
      </s-stack>

      {done ? (
        <s-button
          slot="primary-action"
          commandFor={SEO_MODAL_ID}
          command="--hide"
        >
          Done
        </s-button>
      ) : showEdit ? (
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!plan.valid}
          onClick={() => {
            setSession((n) => n + 1); // clear any previous error result
            setStep("confirm");
          }}
        >
          Review changes
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          loading={submitting}
          onClick={confirm}
        >
          Update SEO
        </s-button>
      )}
      {!done && !showEdit && (
        <s-button
          slot="secondary-actions"
          disabled={submitting}
          onClick={() => setStep("edit")}
        >
          Back
        </s-button>
      )}
      {!done && (
        <s-button
          slot="secondary-actions"
          commandFor={SEO_MODAL_ID}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}

/** Publish / Move to draft: single review-and-confirm step. */
export function StatusModal({
  product,
  next,
  checks,
}: {
  product: Product;
  next: "ACTIVE" | "DRAFT";
  checks: HealthCheck[];
}) {
  const [session, setSession] = useState(0);
  const fetcher = useFetcher<WriteActionResult>({
    key: `status-${product.id}-${session}`,
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const result = fetcher.data;
  const submitting = fetcher.state !== "idle";
  const plan = planStatusChange({ current: product.status, next, checks });
  const done = result?.ok === true;
  const blocked =
    !plan.valid || (plan.requiresExtraConfirmation && !acknowledged);

  const reset = () => {
    setSession((n) => n + 1);
    setAcknowledged(false);
  };

  const confirm = () =>
    fetcher.submit(
      {
        intent: "set_status",
        productId: product.id,
        status: next,
        expectedStatus: product.status,
        acknowledge: acknowledged ? "yes" : "no",
        confirm: "yes",
      },
      { method: "post" },
    );

  return (
    <s-modal
      id={STATUS_MODAL_ID}
      heading={next === "ACTIVE" ? "Publish product" : "Move product to draft"}
      onShow={reset}
    >
      <s-stack gap="base">
        <ResultBanner result={result} />
        {!done && (
          <>
            <s-paragraph>
              {describeStatusChange(product.title, next)}
            </s-paragraph>
            <BeforeAfter
              rows={[
                {
                  label: "Status",
                  before: enumLabel(plan.summary.before),
                  after: enumLabel(plan.summary.after),
                },
              ]}
            />
            {plan.errors.map((e) => (
              <s-text key={e.message} tone="critical">
                {e.message}
              </s-text>
            ))}
            {plan.requiresExtraConfirmation && (
              <>
                <s-banner
                  tone="warning"
                  heading="This product isn't ready to sell"
                >
                  <s-unordered-list>
                    {plan.warnings.map((w) => (
                      <s-list-item key={w}>{w}</s-list-item>
                    ))}
                  </s-unordered-list>
                </s-banner>
                <s-divider />
                <s-checkbox
                  label="I understand these issues and want to publish anyway"
                  checked={acknowledged}
                  onChange={(event) =>
                    setAcknowledged(event.currentTarget.checked)
                  }
                />
              </>
            )}
          </>
        )}
      </s-stack>

      {done ? (
        <s-button
          slot="primary-action"
          commandFor={STATUS_MODAL_ID}
          command="--hide"
        >
          Done
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          tone={next === "DRAFT" ? "critical" : "auto"}
          disabled={blocked}
          loading={submitting}
          onClick={confirm}
        >
          {next === "ACTIVE" ? "Publish product" : "Move to draft"}
        </s-button>
      )}
      {!done && (
        <s-button
          slot="secondary-actions"
          commandFor={STATUS_MODAL_ID}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}
