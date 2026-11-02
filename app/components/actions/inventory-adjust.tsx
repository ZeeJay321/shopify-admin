import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import {
  describeInventoryChange,
  parseIntegerInput,
  planInventoryAdjustment,
} from "../../lib/actions";
import {
  Acknowledgement,
  BeforeAfter,
  ResultBanner,
  StepHeader,
  Warnings,
  fieldError,
  newActionKey,
} from "./shared";

export const ADJUST_MODAL = "adjust-stock-modal";

export type AdjustTarget = {
  productId: string;
  productTitle: string;
  variantTitle: string;
  inventoryItemId: string;
  locations: Array<{ id: string; name: string; available: number }>;
  /** Preselected location (e.g. the active location filter). */
  defaultLocationId: string | null;
};

/**
 * One shared dialog for the Inventory Risk table. Stock is changed with
 * Shopify's compare-and-set: if it changed since the dialog loaded, Shopify
 * rejects it, we show the current value and the merchant reviews again.
 */
export function InventoryAdjustModal({
  target,
}: {
  target: AdjustTarget | null;
}) {
  const [session, setSession] = useState(0);
  const fetcher = useFetcher<WriteActionResult>({ key: `adjust-${session}` });
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [touched, setTouched] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [actionKey, setActionKey] = useState("");
  /** Quantity Shopify reported after a conflict, overriding the page data. */
  const [reloaded, setReloaded] = useState<Record<string, number>>({});

  const reset = () => {
    setSession((n) => n + 1);
    setStep("edit");
    setTouched(false);
    setAcknowledged(false);
    setReloaded({});
    if (target) {
      const first =
        target.locations.find((l) => l.id === target.defaultLocationId) ??
        target.locations[0];
      setLocationId(first?.id ?? "");
      setQuantity(first ? String(first.available) : "");
    }
  };

  // A different row was chosen: start fresh for it.
  useEffect(reset, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = fetcher.data;
  useEffect(() => {
    if (!result || result.ok) return;
    setStep("edit");
    const current = result.current?.quantity;
    if (result.code === "conflict" && typeof current === "number") {
      setReloaded((prev) => ({ ...prev, [locationId]: current }));
      setQuantity(String(current));
      setTouched(false);
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) {
    return <s-modal id={ADJUST_MODAL} heading="Adjust stock" />;
  }

  const location = target.locations.find((l) => l.id === locationId);
  const expected = reloaded[locationId] ?? location?.available ?? 0;
  const plan = planInventoryAdjustment({
    expected,
    next: parseIntegerInput(quantity),
  });
  const label = `${target.productTitle} – ${target.variantTitle}`;
  const submitting = fetcher.state !== "idle";
  const done = result?.ok === true;
  const multiLocation = target.locations.length > 1;

  const review = () => {
    setActionKey(newActionKey()); // frozen for this confirmation (idempotency)
    setStep("confirm");
  };

  const confirm = () =>
    fetcher.submit(
      {
        intent: "adjust_inventory",
        productId: target.productId,
        inventoryItemId: target.inventoryItemId,
        locationId,
        expectedQuantity: String(expected),
        quantity: String(plan.summary.after),
        actionKey,
        acknowledge: acknowledged ? "yes" : "no",
        confirm: "yes",
      },
      { method: "post" },
    );

  return (
    <s-modal id={ADJUST_MODAL} heading="Adjust stock" onShow={reset}>
      <s-stack gap="base">
        <ResultBanner result={result} />
        {result && !result.ok && result.code === "conflict" && (
          <s-paragraph>
            Stock changed in Shopify while this dialog was open. The current
            quantity at {location?.name ?? "this location"} is now {expected}.
            Review the new quantity and confirm again.
          </s-paragraph>
        )}

        {!done && step === "edit" && (
          <>
            <StepHeader
              step={1}
              of={2}
              title="Set the new quantity"
              detail={label}
            />
            {multiLocation ? (
              <s-select
                label="Location"
                value={locationId}
                onChange={(event) => {
                  const id = event.currentTarget.value;
                  setLocationId(id);
                  const loc = target.locations.find((l) => l.id === id);
                  setQuantity(String(reloaded[id] ?? loc?.available ?? ""));
                  setTouched(false);
                }}
              >
                {target.locations.map((l) => (
                  <s-option key={l.id} value={l.id}>
                    {`${l.name} (${reloaded[l.id] ?? l.available} available)`}
                  </s-option>
                ))}
              </s-select>
            ) : (
              <s-text>Location: {location?.name}</s-text>
            )}
            <s-number-field
              label="New available quantity"
              value={quantity}
              min={0}
              details={`Currently ${expected} available`}
              error={fieldError("quantity", plan.errors, result, touched)}
              onInput={(event) => {
                setQuantity(event.currentTarget.value);
                setTouched(true);
              }}
            />
            {touched && plan.valid && (
              <s-text color="subdued">
                {`Change: ${plan.summary.delta > 0 ? "+" : ""}${plan.summary.delta} units`}
              </s-text>
            )}
            <Warnings warnings={plan.warnings} />
            {plan.requiresExtraConfirmation && (
              <>
                <Acknowledgement
                  label="I've checked this change is correct"
                  checked={acknowledged}
                  onChange={setAcknowledged}
                />
              </>
            )}
          </>
        )}

        {!done && step === "confirm" && (
          <>
            <StepHeader
              step={2}
              of={2}
              title="Review and confirm"
              detail={describeInventoryChange(
                label,
                location?.name ?? "this location",
                plan.summary,
              )}
            />
            <BeforeAfter
              rows={[
                {
                  label: "Available",
                  before: plan.summary.before,
                  after: plan.summary.after,
                },
              ]}
            />
          </>
        )}
      </s-stack>

      {done ? (
        <s-button
          slot="primary-action"
          commandFor={ADJUST_MODAL}
          command="--hide"
        >
          Done
        </s-button>
      ) : step === "edit" ? (
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={
            !plan.valid || (plan.requiresExtraConfirmation && !acknowledged)
          }
          onClick={review}
        >
          Review change
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          variant="primary"
          loading={submitting}
          onClick={confirm}
        >
          Update stock
        </s-button>
      )}
      {!done && step === "confirm" && (
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
          commandFor={ADJUST_MODAL}
          command="--hide"
        >
          Cancel
        </s-button>
      )}
    </s-modal>
  );
}
