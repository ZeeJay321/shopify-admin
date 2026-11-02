import { SCORE_BUCKETS } from "../../lib/product-health/distribution";
import { plural } from "../../lib/presentation";
import { ColumnChart } from "./ColumnChart";

/** Products per health-score band (0-19 … 80-100). */
export function Histogram({
  counts,
  label = "Products by health score",
  emptyAction,
}: {
  /** One count per SCORE_BUCKETS entry. */
  counts: readonly number[];
  label?: string;
  emptyAction?: { label: string; href: string };
}) {
  return (
    <ColumnChart
      label={label}
      valueLabel="Products"
      height={180}
      emptyMessage="No products scored yet."
      emptyAction={emptyAction}
      data={SCORE_BUCKETS.map((bucket, i) => ({
        key: bucket.label,
        label: bucket.label,
        value: counts[i] ?? 0,
        detail: `Score ${bucket.label} (${plural(counts[i] ?? 0, "product")})`,
      }))}
    />
  );
}
