import { formatNumber } from "../../lib/presentation";
import { toPercentages } from "./geometry";
import { toneColor } from "./palette";
import type { Segment } from "./parts";
import { Legend } from "./parts";

/** One bar split into tone segments, with a legend of counts and shares. */
export function StackedProportionBar({
  segments,
  label,
  size = "regular",
  showLegend = true,
  emptyMessage = "Nothing to show yet.",
}: {
  segments: readonly Segment[];
  label: string;
  size?: "regular" | "thin";
  showLegend?: boolean;
  emptyMessage?: string;
}) {
  const visible = segments.filter((s) => s.value > 0);
  if (visible.length === 0) {
    return <s-text color="subdued">{emptyMessage}</s-text>;
  }
  const percents = toPercentages(segments.map((s) => s.value));
  const summary = `${label}: ${segments
    .map(
      (s, i) =>
        `${s.label} ${s.valueText ?? formatNumber(s.value)} (${percents[i]}%)`,
    )
    .join(", ")}`;

  return (
    <s-stack gap="small-200">
      <div
        className={`zj-stack${size === "thin" ? " zj-stack--thin" : ""}`}
        role="img"
        aria-label={summary}
      >
        {visible.map((s) => (
          <span
            key={s.key}
            style={{ flex: `${s.value} 1 0`, background: toneColor(s.tone) }}
          />
        ))}
      </div>
      {showLegend && <Legend items={segments} />}
    </s-stack>
  );
}
