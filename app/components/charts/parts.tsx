/** Building blocks shared by the charts: legend, data table, empty state. */

import type { ReactNode } from "react";
import type { Tone } from "../../lib/presentation";
import { formatNumber } from "../../lib/presentation";
import { toPercentages } from "./geometry";
import { toneColor } from "./palette";

export type Segment = {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  /** Overrides the formatted value in legends and tables. */
  valueText?: string;
};

export function Swatch({ tone }: { tone: Tone }) {
  return (
    <span
      className="zj-swatch"
      style={{ background: toneColor(tone) }}
      aria-hidden="true"
    />
  );
}

/** Color key with counts and shares, so color is never the only signal. */
export function Legend({
  items,
  layout = "row",
  showPercent = true,
}: {
  items: readonly Segment[];
  layout?: "row" | "column";
  showPercent?: boolean;
}) {
  const percents = toPercentages(items.map((i) => i.value));
  return (
    <ul
      className={`zj-legend${layout === "column" ? " zj-legend--column" : ""}`}
    >
      {items.map((item, i) => (
        <li key={item.key}>
          <Swatch tone={item.tone} />
          <s-text>{item.label}</s-text>
          <s-text color="subdued">
            {`${item.valueText ?? formatNumber(item.value)}${showPercent ? ` · ${percents[i]}%` : ""}`}
          </s-text>
        </li>
      ))}
    </ul>
  );
}

/** "Show data" disclosure with the chart's values as a plain table. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly [string, string];
  rows: ReadonlyArray<{ key: string; label: string; value: string }>;
}) {
  return (
    <details className="zj-details">
      <summary>
        <s-text color="subdued">Show data</s-text>
      </summary>
      <table className="zj-data-table">
        <caption className="zj-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{columns[0]}</th>
            <th scope="col">{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Shown in place of a chart when there isn't enough real data. */
export function ChartEmpty({
  message,
  action,
  icon = "chart-vertical",
}: {
  message: string;
  action?: { label: string; href: string };
  icon?: "chart-vertical" | "chart-donut" | "chart-line" | "data-presentation";
}) {
  return (
    <s-box padding="large" borderRadius="base" background="subdued">
      <s-stack gap="small-200" alignItems="center">
        <s-icon type={icon} tone="neutral" />
        <s-text color="subdued">{message}</s-text>
        {action && <s-link href={action.href}>{action.label}</s-link>}
      </s-stack>
    </s-box>
  );
}

/** Floating value label positioned in px inside a `.zj-chart` wrapper. */
export function Tooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <div className="zj-tooltip" style={{ left: x, top: y }} aria-hidden="true">
      {children}
    </div>
  );
}
