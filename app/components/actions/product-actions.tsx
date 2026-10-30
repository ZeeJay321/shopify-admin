import { useEffect, useState } from "react";
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
import {
  BeforeAfter,
  ResultBanner,
  Warnings,
  WriteAccessBanner,
  fieldError,
} from "./shared";

type Product = { id: string; title: string; status: string };
type Seo = { title: string; description: string };

const SEO_MODAL = "fix-seo-modal";
const STATUS_MODAL = "status-modal";

export function ProductActions({
  product,
  seo,
  suggestion,
  checks,
  canWrite,
  seoNeedsWork,
}: {
  product: Product;
  seo: Seo;
  suggestion: Seo;
  checks: HealthCheck[];
  canWrite: boolean;
  seoNeedsWork: boolean;
}) {
  const next = isEditableStatus(product.status)
    ? STATUS_TRANSITIONS[product.status]
    : null;

  return (
    <s-section heading="Actions">
      <s-stack gap="base">
        {!canWrite && <WriteAccessBanner action="fix SEO or change status" />}
        <s-stack direction="inline" gap="base">
          <s-button
            variant={seoNeedsWork ? "primary" : "secondary"}
            disabled={!canWrite}
            commandFor={SEO_MODAL}
            command="--show"
          >
            Fix SEO
          </s-button>
          {next && (
            <s-button
              disabled={!canWrite}
              commandFor={STATUS_MODAL}
              command="--show"
            >
              {next === "ACTIVE" ? "Publish (set active)" : "Move to draft"}
            </s-button>
          )}
        </s-stack>
        <s-text color="subdued">
          Changes are previewed and confirmed before anything is saved to
          Shopify.
        </s-text>
      </s-stack>

      {canWrite && (
        <SeoModal product={product} seo={seo} suggestion={suggestion} />
      )}
      {canWrite && next && (
        <StatusModal product={product} next={next} checks={checks} />
      )}
    </s-section>
  );
}

function SeoModal({
  product,
  seo,
  suggestion,
}: {
  product: Product;
  seo: Seo;
  suggestion: Seo;
}) {
  const fetcher = useFetcher<WriteActionResult>();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [title, setTitle] = useState(seo.title || suggestion.title);
  const [description, setDescription] = useState(
    seo.description || suggestion.description,
  );
  const result = fetcher.data;
  const submitting = fetcher.state !== "idle";
  const plan = planSeoUpdate({ current: seo, next: { title, description } });

  // After a conflict or validation error, go back to editing (the loader has
  // revalidated, so `seo` now holds Shopify's current values).
  useEffect(() => {
    if (result && !result.ok) setStep("edit");
  }, [result]);

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

  const done = result?.ok === true;

  return (
    <s-modal id={SEO_MODAL} heading={`Fix SEO: ${product.title}`} size="large">
      <s-stack gap="base">
        <ResultBanner result={result} />
        {result &&
          !result.ok &&
          result.code === "conflict" &&
          result.current && (
            <s-paragraph>
              Shopify now has: title &quot;{String(result.current.title ?? "")}
              &quot;, description &quot;
              {String(result.current.description ?? "")}&quot;. Your edits are
              kept below; review them and confirm again.
            </s-paragraph>
          )}

        {!done && step === "edit" && (
          <>
            <s-text-field
              label="SEO title"
              value={title}
              details={`${plan.values.title.length}/${MAX_SEO_TITLE_LENGTH} characters`}
              error={fieldError("title", plan.errors, result)}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
            <s-text-area
              label="SEO description"
              value={description}
              rows={3}
              details={`${plan.values.description.length}/${MAX_SEO_DESCRIPTION_LENGTH} characters`}
              error={fieldError("description", plan.errors, result)}
              onInput={(event) => setDescription(event.currentTarget.value)}
            />
            <s-stack direction="inline" gap="small">
              <s-button
                variant="tertiary"
                onClick={() => {
                  setTitle(suggestion.title);
                  setDescription(suggestion.description);
                }}
              >
                Use suggestion
              </s-button>
            </s-stack>
            {fieldError("form", plan.errors, result) && (
              <s-text tone="critical">
                {fieldError("form", plan.errors, result)}
              </s-text>
            )}
            <Warnings warnings={plan.warnings} />
            <BeforeAfter
              rows={[
                { label: "SEO title", ...plan.summary.title },
                { label: "SEO description", ...plan.summary.description },
              ]}
            />
          </>
        )}

        {!done && step === "confirm" && (
          <>
            <s-paragraph>{describeSeoChange(product.title)}</s-paragraph>
            <BeforeAfter
              rows={[
                { label: "SEO title", ...plan.summary.title },
                { label: "SEO description", ...plan.summary.description },
              ]}
            />
          </>
        )}
      </s-stack>

      {done ? (
        <s-button slot="primary-action" commandFor={SEO_MODAL} command="--hide">
          Done
        </s-button>
      ) : step === "edit" ? (
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!plan.valid}
          onClick={() => setStep("confirm")}
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
          Confirm
        </s-button>
      )}
      {!done && step === "confirm" ? (
        <s-button
          slot="secondary-actions"
          disabled={submitting}
          onClick={() => setStep("edit")}
        >
          Back
        </s-button>
      ) : null}
      {!done && (
        <s-button
          slot="secondary-actions"
          commandFor={SEO_MODAL}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}

function StatusModal({
  product,
  next,
  checks,
}: {
  product: Product;
  next: "ACTIVE" | "DRAFT";
  checks: HealthCheck[];
}) {
  const fetcher = useFetcher<WriteActionResult>();
  const [acknowledged, setAcknowledged] = useState(false);
  const result = fetcher.data;
  const submitting = fetcher.state !== "idle";
  const plan = planStatusChange({ current: product.status, next, checks });
  const done = result?.ok === true;
  const blocked =
    !plan.valid || (plan.requiresExtraConfirmation && !acknowledged);

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
      id={STATUS_MODAL}
      heading={next === "ACTIVE" ? "Publish product" : "Move product to draft"}
    >
      <s-stack gap="base">
        <ResultBanner result={result} />
        {!done && (
          <>
            <s-paragraph>
              {describeStatusChange(product.title, next)}
            </s-paragraph>
            <BeforeAfter rows={[{ label: "Status", ...plan.summary }]} />
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
                <s-checkbox
                  label="I understand and want to publish it anyway"
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
          commandFor={STATUS_MODAL}
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
          Confirm
        </s-button>
      )}
      {!done && (
        <s-button
          slot="secondary-actions"
          commandFor={STATUS_MODAL}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}
