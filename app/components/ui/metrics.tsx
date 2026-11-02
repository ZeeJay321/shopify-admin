/**
 * Layout and card primitives. Charts and metric cards live in
 * components/charts.
 */

import type { ReactNode } from "react";

/** Responsive card grid: 1 column narrow, 2 medium, `columns` wide. */
export function CardGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        gridTemplateColumns={`@container (inline-size > 720px) repeat(${columns}, minmax(0, 1fr)), @container (inline-size > 420px) repeat(2, minmax(0, 1fr)), minmax(0, 1fr)`}
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}

const SPLITS = {
  "2:1": "minmax(0, 2fr) minmax(0, 1fr)",
  "1:2": "minmax(0, 1fr) minmax(0, 2fr)",
  "1:1": "minmax(0, 1fr) minmax(0, 1fr)",
} as const;

/** Two-column layout that stacks below 720px (default main | side). */
export function SplitGrid({
  ratio = "2:1",
  children,
}: {
  ratio?: keyof typeof SPLITS;
  children: ReactNode;
}) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        gridTemplateColumns={`@container (inline-size > 720px) ${SPLITS[ratio]}, minmax(0, 1fr)`}
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}

/**
 * Card that matches Admin cards and fills its grid cell, with an optional
 * header (heading, subdued subheading, one link).
 */
export function Card({
  heading,
  subheading,
  action,
  children,
}: {
  heading?: string;
  subheading?: string;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="base"
      blockSize="100%"
    >
      <s-stack gap="base">
        {(heading || action) && (
          <s-stack
            direction="inline"
            gap="small-200"
            alignItems="start"
            justifyContent="space-between"
          >
            <s-stack gap="small-300">
              {heading && <s-heading>{heading}</s-heading>}
              {subheading && <s-text color="subdued">{subheading}</s-text>}
            </s-stack>
            {action && <s-link href={action.href}>{action.label}</s-link>}
          </s-stack>
        )}
        {children}
      </s-stack>
    </s-box>
  );
}

/** Highlighted "do this next" card with one action. */
export function Callout({
  heading,
  body,
  action,
  icon = "lightbulb",
}: {
  heading: string;
  body: string;
  action: { label: string; href: string };
  icon?: "lightbulb" | "alert-circle" | "check-circle";
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="base"
    >
      <s-query-container>
        <s-grid
          gap="base"
          alignItems="center"
          gridTemplateColumns="@container (inline-size > 560px) minmax(0, 1fr) auto, minmax(0, 1fr)"
        >
          <s-stack gap="small-300">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-icon type={icon} tone="info" />
              <s-text color="subdued">Next best action</s-text>
            </s-stack>
            <s-heading>{heading}</s-heading>
            <s-text>{body}</s-text>
          </s-stack>
          <s-stack direction="inline">
            <s-button href={action.href}>{action.label}</s-button>
          </s-stack>
        </s-grid>
      </s-query-container>
    </s-box>
  );
}
