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

export type SkeletonVariant = "dashboard" | "table" | "detail" | "readiness";

function SkeletonCard({
  children,
  height,
}: {
  children?: ReactNode;
  height?: `${number}px`;
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="base"
      minBlockSize={height}
    >
      <s-stack gap="small-200">
        <SkeletonLine width="40%" height="16px" />
        {children}
      </s-stack>
    </s-box>
  );
}

function SkeletonGrid({
  columns,
  children,
}: {
  columns: string;
  children: ReactNode;
}) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        gridTemplateColumns={`@container (inline-size > 720px) ${columns}, minmax(0, 1fr)`}
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}

const METRIC_ROW = (
  <SkeletonGrid columns="repeat(4, minmax(0, 1fr))">
    {[0, 1, 2, 3].map((i) => (
      <SkeletonCard key={i} height="120px">
        <SkeletonLine width="50%" height="28px" />
      </SkeletonCard>
    ))}
  </SkeletonGrid>
);

/** Placeholder shaped like the page being opened (no layout jump). */
export function PageSkeleton({
  variant = "table",
}: {
  variant?: SkeletonVariant;
}) {
  return (
    <s-box
      accessibilityRole="status"
      accessibilityLabel="Loading page"
      padding="base"
    >
      <s-stack gap="base">
        <SkeletonLine width="30%" height="24px" />
        {variant === "dashboard" && (
          <>
            {METRIC_ROW}
            <SkeletonGrid columns="minmax(0, 1fr) minmax(0, 2fr)">
              <SkeletonCard height="260px" />
              <SkeletonCard height="260px" />
            </SkeletonGrid>
            <SkeletonGrid columns="minmax(0, 1fr) minmax(0, 1fr)">
              <SkeletonCard height="260px" />
              <SkeletonCard height="260px" />
            </SkeletonGrid>
          </>
        )}
        {variant === "table" && (
          <>
            {METRIC_ROW}
            <SkeletonCard height="220px" />
            <SkeletonCard>
              <TableSkeleton />
            </SkeletonCard>
          </>
        )}
        {variant === "detail" && (
          <SkeletonGrid columns="minmax(0, 2fr) minmax(0, 1fr)">
            <s-stack gap="base">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} height="180px">
                  <SkeletonLine />
                  <SkeletonLine width="80%" />
                </SkeletonCard>
              ))}
            </s-stack>
            <SkeletonCard height="320px" />
          </SkeletonGrid>
        )}
        {variant === "readiness" && (
          <>
            <SkeletonGrid columns="minmax(0, 1fr) minmax(0, 2fr)">
              <SkeletonCard height="240px" />
              <SkeletonCard height="240px" />
            </SkeletonGrid>
            {[0, 1].map((i) => (
              <SkeletonCard key={i} height="180px">
                <SkeletonLine />
                <SkeletonLine width="70%" />
              </SkeletonCard>
            ))}
          </>
        )}
      </s-stack>
    </s-box>
  );
}

/** Which skeleton matches a target app path. */
export function skeletonFor(pathname: string): SkeletonVariant {
  if (pathname === "/app" || pathname === "/app/") return "dashboard";
  if (pathname.startsWith("/app/readiness")) return "readiness";
  if (/^\/app\/products\/[^/]+/.test(pathname)) return "detail";
  return "table";
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
