import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { WriteActionResult } from "../../lib/actions";
import {
  describeInventoryChange,
  parseIntegerInput,
  planInventoryAdjustment,
} from "../../lib/actions";
import {
  BeforeAfter,
  ResultBanner,
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
  const fetcher = useFetcher<WriteActionResult>();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [actionKey, setActionKey] = useState("");
  /** Quantity Shopify reported after a conflict, overriding the page data. */
  const [reloaded, setReloaded] = useState<Record<string, number>>({});

  // Reset whenever a different variant is opened.
  useEffect(() => {
    if (!target) return;
    const first =
      target.locations.find((l) => l.id === target.defaultLocationId) ??
      target.locations[0];
    setLocationId(first?.id ?? "");
    setQuantity(first ? String(first.available) : "");
    setStep("edit");
    setAcknowledged(false);
    setReloaded({});
  }, [target]);

  const result = fetcher.data;
  useEffect(() => {
    if (!result || result.ok) return;
    setStep("edit");
    const current = result.current?.quantity;
    if (result.code === "conflict" && typeof current === "number") {
      setReloaded((prev) => ({ ...prev, [locationId]: current }));
    }
    // locationId is the one that was submitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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

  const review = () => {
    setActionKey(newActionKey()); // frozen for this confirmation
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
    <s-modal id={ADJUST_MODAL} heading={`Adjust stock: ${label}`}>
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
            <s-select
              label="Location"
              value={locationId}
              onChange={(event) => {
                const id = event.currentTarget.value;
                setLocationId(id);
                const loc = target.locations.find((l) => l.id === id);
                setQuantity(String(reloaded[id] ?? loc?.available ?? ""));
              }}
            >
              {target.locations.map((l) => (
                <s-option key={l.id} value={l.id}>
                  {l.name}
                </s-option>
              ))}
            </s-select>
            <s-text>
              Current available at {location?.name}:{" "}
              <s-text type="strong">{expected}</s-text>
            </s-text>
            <s-text-field
              label="New available quantity"
              value={quantity}
              error={fieldError("quantity", plan.errors, result)}
              onInput={(event) => setQuantity(event.currentTarget.value)}
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
            <Warnings warnings={plan.warnings} />
            {plan.requiresExtraConfirmation && (
              <s-checkbox
                label="I've checked this change is correct"
                checked={acknowledged}
                onChange={(event) =>
                  setAcknowledged(event.currentTarget.checked)
                }
              />
            )}
          </>
        )}

        {!done && step === "confirm" && (
          <s-paragraph>
            {describeInventoryChange(
              label,
              location?.name ?? "this location",
              plan.summary,
            )}
          </s-paragraph>
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
          Confirm
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
