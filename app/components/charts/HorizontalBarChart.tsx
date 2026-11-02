import type { Tone } from "../../lib/presentation";
import { formatNumber } from "../../lib/presentation";
import { barLength } from "./geometry";
import { ACCENT, toneColor } from "./palette";
import { ChartEmpty } from "./parts";

export type BarItem = {
  key: string;
  label: string;
  value: number;
  /** Status tone; omit for plain magnitude (single accent color). */
  tone?: Tone;
  href?: string;
  valueText?: string;
};

/**
 * Labelled horizontal bars with the value as text on every row. A list,
 * not an image, so row links stay usable.
 */
export function HorizontalBarChart({
  items,
  label,
  max,
  emptyMessage = "Nothing to show yet.",
  emptyAction,
}: {
  items: readonly BarItem[];
  label: string;
  /** Axis maximum; defaults to the largest value. */
  max?: number;
  emptyMessage?: string;
  emptyAction?: { label: string; href: string };
}) {
  if (items.length === 0) {
    return <ChartEmpty message={emptyMessage} action={emptyAction} />;
  }
  const top = max ?? Math.max(0, ...items.map((i) => i.value));
  return (
    <ul className="zj-hbar" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="zj-row">
            {item.href ? (
              <s-link href={item.href}>{item.label}</s-link>
            ) : (
              <s-text>{item.label}</s-text>
            )}
            <s-text color="subdued">
              {item.valueText ?? formatNumber(item.value)}
            </s-text>
          </div>
          <div className="zj-track" aria-hidden="true">
            <div
              className="zj-fill"
              style={{
                inlineSize: `${barLength(item.value, top, 100)}%`,
                background: item.tone ? toneColor(item.tone) : ACCENT,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
