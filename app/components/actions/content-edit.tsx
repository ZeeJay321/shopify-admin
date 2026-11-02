/**
 * Edit title and description: step 1 form with live counters, step 2
 * Before / After and confirm. The description is plain text; the server
 * escapes it and turns blank lines into paragraphs. Only changed fields are
 * saved, so an untouched description keeps its formatting.
 */

import { useState } from "react";
import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import { planContentUpdate } from "../../lib/actions";
import {
  MAX_DESCRIPTION_TEXT_LENGTH,
  MAX_PRODUCT_TITLE_LENGTH,
} from "../../lib/config";
import {
  BeforeAfter,
  CharCounter,
  ResultBanner,
  StepHeader,
  Warnings,
  fieldError,
} from "./shared";

export type ContentTarget = { id: string; title: string; description: string };

export function ContentEditDialog({
  modalId,
  target,
}: {
  modalId: string;
  target: ContentTarget | null;
}) {
  const [session, setSession] = useState(0);
  const fetcher = useFetcher<WriteActionResult>({
    key: `${modalId}-${session}`,
  });
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const current = target ?? { id: "", title: "", description: "" };
  const plan = planContentUpdate({ current, next: { title, description } });
  const result = fetcher.data;
  const done = result?.ok === true;
  const submitting = fetcher.state !== "idle";
  const showEdit =
    !done && (step === "edit" || (result !== undefined && !result.ok));

  const reset = () => {
    setSession((n) => n + 1);
    setStep("edit");
    setTitle(current.title);
    setDescription(current.description);
    setTouched(false);
  };

  const confirm = () =>
    fetcher.submit(
      {
        intent: "update_content",
        confirm: "yes",
        productId: current.id,
        title: plan.values.title,
        description: plan.values.description,
        expectedTitle: current.title,
        expectedDescription: current.description,
      },
      { method: "post" },
    );

  return (
    <s-modal
      id={modalId}
      heading="Edit title and description"
      size="large"
      onShow={reset}
    >
      <s-stack gap="base">
        <ResultBanner result={result} />
        {showEdit && (
          <>
            <StepHeader
              step={1}
              of={2}
              title="Edit the product"
              detail={current.title}
            />
            <s-stack gap="small-300">
              <s-text-field
                label="Title"
                value={title}
                error={fieldError("title", plan.errors, result, touched)}
                onInput={(event) => {
                  setTitle(event.currentTarget.value);
                  setTouched(true);
                }}
              />
              <CharCounter
                length={plan.values.title.length}
                max={MAX_PRODUCT_TITLE_LENGTH}
              />
            </s-stack>
            <s-stack gap="small-300">
              <s-text-area
                label="Description (plain text)"
                value={description}
                rows={6}
                details="Leave a blank line between paragraphs."
                error={fieldError("description", plan.errors, result, touched)}
                onInput={(event) => {
                  setDescription(event.currentTarget.value);
                  setTouched(true);
                }}
              />
              <CharCounter
                length={plan.values.description.length}
                max={MAX_DESCRIPTION_TEXT_LENGTH}
              />
            </s-stack>
            {plan.changed.description && (
              <s-banner tone="info">
                Saving a new description replaces its current formatting (bold,
                lists, links) with plain paragraphs.
              </s-banner>
            )}
            <Warnings warnings={plan.warnings} />
          </>
        )}
        {!done && !showEdit && (
          <>
            <StepHeader step={2} of={2} title="Review and confirm" />
            <BeforeAfter
              rows={[
                { label: "Title", ...plan.summary.title },
                ...(plan.changed.description
                  ? [{ label: "Description", ...plan.summary.description }]
                  : []),
              ]}
            />
          </>
        )}
      </s-stack>

      {done ? (
        <s-button slot="primary-action" commandFor={modalId} command="--hide">
          Done
        </s-button>
      ) : showEdit ? (
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!plan.valid}
          onClick={() => {
            setSession((n) => n + 1);
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
          Save changes
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
          commandFor={modalId}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}
