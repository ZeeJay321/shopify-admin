/**
 * Page states: empty, loading skeletons, error with retry, permission
 * banners, data-cap notices, and live-region feedback.
 */

import type { ReactNode } from "react";
import { useRevalidator } from "react-router";
import type { MerchantError } from "../../lib/shopify/errors";

export function EmptyState({
  heading,
  body,
  icon = "search",
  action,
}: {
  heading: string;
  body: string;
  icon?:
    | "search"
    | "product"
    | "inventory"
    | "order"
    | "check-circle"
    | "collection";
  action?: { label: string; href: string };
}) {
  return (
    <s-empty-state heading={heading}>
      <s-icon slot="graphic" type={icon} />
      <s-text slot="subheading">{body}</s-text>
      {action && (
        <s-button slot="primary-action" href={action.href}>
          {action.label}
        </s-button>
      )}
    </s-empty-state>
  );
}

/** A grey placeholder bar. */
export function SkeletonLine({
  width = "100%",
  height = "12px",
}: {
  width?: `${number}%` | `${number}px`;
  height?: `${number}px`;
}) {
  return (
    <s-box
      background="subdued"
      borderRadius="base"
      inlineSize={width}
      blockSize={height}
    />
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <s-stack gap="base">
      {Array.from({ length: rows }, (_, i) => (
        <s-stack key={i} direction="inline" gap="base" alignItems="center">
          <SkeletonLine width="32px" height="32px" />
          <SkeletonLine width="40%" />
          <SkeletonLine width="15%" />
          <SkeletonLine width="15%" />
        </s-stack>
      ))}
    </s-stack>
  );
}

/** Mirrors the common page layout (metric row, then a table card). */
export function PageSkeleton() {
  return (
    <s-box
      accessibilityRole="status"
      accessibilityLabel="Loading page"
      padding="base"
    >
      <s-stack gap="large">
        <SkeletonLine width="30%" height="24px" />
        <s-grid gap="base" gridTemplateColumns="repeat(4, minmax(0, 1fr))">
          {[0, 1, 2, 3].map((i) => (
            <s-box
              key={i}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack gap="small-200">
                <SkeletonLine width="60%" />
                <SkeletonLine width="40%" height="24px" />
              </s-stack>
            </s-box>
          ))}
        </s-grid>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <TableSkeleton />
        </s-box>
      </s-stack>
    </s-box>
  );
}

/** Friendly error with a retry that re-runs the page loader. */
export function ErrorState({ error }: { error: MerchantError }) {
  const revalidator = useRevalidator();
  return (
    <s-box accessibilityRole="alert">
      <s-banner
        tone={error.kind === "throttled" ? "warning" : "critical"}
        heading={error.title}
      >
        <s-stack gap="small-200">
          <s-text>{error.message}</s-text>
          <s-stack direction="inline">
            <s-button
              onClick={() => revalidator.revalidate()}
              loading={revalidator.state === "loading"}
            >
              Try again
            </s-button>
          </s-stack>
        </s-stack>
      </s-banner>
    </s-box>
  );
}

/**
 * What's missing, why, and how to approve it. "read" blocks a feature;
 * "write" only disables actions while the page keeps working.
 */
export function PermissionBanner({
  kind,
  feature,
  scopes,
}: {
  kind: "read" | "write";
  feature: string;
  scopes: string[];
}) {
  const list = scopes.join(" and ");
  return (
    <s-banner
      tone={kind === "read" ? "warning" : "info"}
      heading={
        kind === "read"
          ? `Approve access to see ${feature}`
          : `Approve access to ${feature}`
      }
    >
      <s-paragraph>
        {kind === "read"
          ? `${capitalize(feature)} needs the ${list} permission${scopes.length > 1 ? "s" : ""}. `
          : `Making changes needs the ${list} permission${scopes.length > 1 ? "s" : ""}. Everything else on this page keeps working. `}
        Open the app from Shopify Admin and approve the updated access request
        when prompted. If you don&apos;t see a prompt, reinstall the app on this
        store.
      </s-paragraph>
    </s-banner>
  );
}

/** Subdued "Based on N …" / scope notes, always the same style. */
export function DataCapNotice({ children }: { children: ReactNode }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon type="info" tone="neutral" size="small" />
      <s-text color="subdued">{children}</s-text>
    </s-stack>
  );
}

/** Wraps feedback so screen readers announce it (status or alert). */
export function LiveRegion({
  urgent = false,
  children,
}: {
  urgent?: boolean;
  children: ReactNode;
}) {
  return (
    <s-box accessibilityRole={urgent ? "alert" : "status"}>{children}</s-box>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
