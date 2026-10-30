import type { FieldError, WriteActionResult } from "../../lib/actions";

/** Shown instead of failing when a write scope isn't approved yet. */
export function WriteAccessBanner({ action }: { action: string }) {
  return (
    <s-banner tone="warning" heading="Approve new permissions to make changes">
      To {action}, the app needs permission to update your store. Open the app
      from Shopify Admin and approve the updated access request. Everything else
      on this page keeps working without it.
    </s-banner>
  );
}

export function ResultBanner({
  result,
}: {
  result: WriteActionResult | undefined;
}) {
  if (!result) return null;
  if (result.ok) return <s-banner tone="success">{result.message}</s-banner>;
  return (
    <s-banner tone={result.code === "conflict" ? "warning" : "critical"}>
      {result.message}
    </s-banner>
  );
}

/** First error for a field, preferring the server's answer. */
export function fieldError(
  field: string,
  clientErrors: readonly FieldError[],
  result: WriteActionResult | undefined,
): string | undefined {
  const server = result && !result.ok ? result.fieldErrors : undefined;
  return (
    server?.find((e) => e.field === field)?.message ??
    clientErrors.find((e) => e.field === field)?.message
  );
}

export type BeforeAfterRow = {
  label: string;
  before: string | number;
  after: string | number;
};

export function BeforeAfter({ rows }: { rows: BeforeAfterRow[] }) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">Field</s-table-header>
        <s-table-header>Before</s-table-header>
        <s-table-header>After</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {rows.map((row) => (
          <s-table-row key={row.label}>
            <s-table-cell>{row.label}</s-table-cell>
            <s-table-cell>
              <s-text color="subdued">{display(row.before)}</s-text>
            </s-table-cell>
            <s-table-cell>
              <s-text type="strong">{display(row.after)}</s-text>
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}

function display(value: string | number): string {
  return value === "" ? "(empty)" : String(value);
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
