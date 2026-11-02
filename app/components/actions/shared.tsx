import type { FieldError, WriteActionResult } from "../../lib/actions";
import { LiveRegion, PermissionBanner } from "../ui";

/** Shown instead of failing when a write scope isn't approved yet. */
export function WriteAccessBanner({
  action,
  scope = "write_products",
}: {
  action: string;
  scope?: "write_products" | "write_inventory";
}) {
  const label =
    scope === "write_inventory" ? "update inventory" : "update products";
  return <PermissionBanner kind="write" feature={action} scopes={[label]} />;
}

/** Success/error feedback, announced to screen readers; never auto-hidden. */
export function ResultBanner({
  result,
}: {
  result: WriteActionResult | undefined;
}) {
  if (!result) return null;
  if (result.ok) {
    return (
      <LiveRegion>
        <s-banner tone="success">{result.message}</s-banner>
      </LiveRegion>
    );
  }
  return (
    <LiveRegion urgent>
      <s-banner tone={result.code === "conflict" ? "warning" : "critical"}>
        {result.message}
      </s-banner>
    </LiveRegion>
  );
}

/**
 * First error for a field, preferring the server's answer. Client-side
 * errors only show once the field was touched (no errors before input).
 */
export function fieldError(
  field: string,
  clientErrors: readonly FieldError[],
  result: WriteActionResult | undefined,
  touched = true,
): string | undefined {
  const server = result && !result.ok ? result.fieldErrors : undefined;
  return (
    server?.find((e) => e.field === field)?.message ??
    (touched ? clientErrors.find((e) => e.field === field)?.message : undefined)
  );
}

export type BeforeAfterRow = {
  label: string;
  before: string | number;
  after: string | number;
};

/** Two-column Before / After comparison, stacked on narrow widths. */
export function BeforeAfter({ rows }: { rows: BeforeAfterRow[] }) {
  return (
    <s-stack gap="base">
      {rows.map((row) => {
        const changed = String(row.before) !== String(row.after);
        return (
          <s-stack key={row.label} gap="small-200">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text type="strong">{row.label}</s-text>
              {changed ? (
                <s-badge tone="info">Changes</s-badge>
              ) : (
                <s-badge>No change</s-badge>
              )}
            </s-stack>
            <s-query-container>
              <s-grid
                gap="small-200"
                gridTemplateColumns="@container (inline-size > 480px) minmax(0, 1fr) minmax(0, 1fr), minmax(0, 1fr)"
              >
                <s-box
                  padding="small"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack gap="small-300">
                    <s-text color="subdued">Before</s-text>
                    <s-text>{display(row.before)}</s-text>
                  </s-stack>
                </s-box>
                <s-box padding="small" borderWidth="base" borderRadius="base">
                  <s-stack gap="small-300">
                    <s-text color="subdued">After</s-text>
                    <s-text type="strong">{display(row.after)}</s-text>
                  </s-stack>
                </s-box>
              </s-grid>
            </s-query-container>
          </s-stack>
        );
      })}
    </s-stack>
  );
}

function display(value: string | number): string {
  return value === "" ? "(empty)" : String(value);
}

/** "45 / 70 characters", turning caution near and critical over the limit. */
export function CharCounter({ length, max }: { length: number; max: number }) {
  const tone =
    length > max ? "critical" : length >= max * 0.9 ? "caution" : "neutral";
  const text =
    length > max
      ? `${length} / ${max} characters, ${length - max} over the limit`
      : `${length} / ${max} characters`;
  return <s-text tone={tone}>{text}</s-text>;
}

/** "Step 1 of 2" marker plus what this step is for. */
export function StepHeader({
  step,
  of,
  title,
  detail,
}: {
  step: number;
  of: number;
  title: string;
  detail?: string;
}) {
  return (
    <s-stack gap="small-300">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge tone="info">{`Step ${step} of ${of}`}</s-badge>
        <s-text type="strong">{title}</s-text>
      </s-stack>
      {detail && <s-text color="subdued">{detail}</s-text>}
    </s-stack>
  );
}

/** The extra "I understand" confirmation, set apart from the form. */
export function Acknowledgement({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-checkbox
        label={label}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </s-box>
  );
}

export function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <s-banner tone="warning">
      <s-unordered-list>
        {warnings.map((w) => (
          <s-list-item key={w}>{w}</s-list-item>
        ))}
      </s-unordered-list>
    </s-banner>
  );
}

/** Idempotency key for one confirmed action (frozen when the confirm step opens). */
export function newActionKey(): string {
  return crypto.randomUUID();
}
