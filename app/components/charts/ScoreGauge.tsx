import { scoreTone, scoreVerdict } from "../../lib/presentation";
import { arcPath, gaugeAngles } from "./geometry";
import { INK, toneColor } from "./palette";
import { ChartEmpty } from "./parts";

const MAX_WIDTH = { large: 280, medium: 220, small: 160 } as const;

/** Semicircle 0-100 gauge: number in the middle, tone arc, verdict badge. */
export function ScoreGauge({
  score,
  label,
  size = "large",
  caption,
}: {
  score: number | null;
  /** What the score measures, used in the accessible summary. */
  label: string;
  size?: keyof typeof MAX_WIDTH;
  caption?: string;
}) {
  if (score === null) {
    return (
      <ChartEmpty
        icon="data-presentation"
        message="Not enough data for a score yet."
      />
    );
  }
  const tone = scoreTone(score);
  const verdict = scoreVerdict(score);
  const { track, value } = gaugeAngles(score);
  const [cx, cy, r, stroke] = [100, 100, 80, 14];

  return (
    <s-stack gap="small-200" alignItems="center">
      <div className="zj-chart" style={{ maxInlineSize: MAX_WIDTH[size] }}>
        <svg
          viewBox="0 0 200 112"
          role="img"
          aria-label={`${label}: ${score} out of 100, ${verdict.toLowerCase()}`}
        >
          <path
            d={arcPath(cx, cy, r, ...track)}
            fill="none"
            stroke={INK.track}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {score > 0 && (
            <path
              d={arcPath(cx, cy, r, ...value)}
              fill="none"
              stroke={toneColor(tone)}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          )}
          <text
            x={cx}
            y={88}
            textAnchor="middle"
            className="zj-text-strong"
            style={{ fontSize: 44 }}
          >
            {score}
          </text>
          <text x={cx} y={108} textAnchor="middle" style={{ fontSize: 12 }}>
            out of 100
          </text>
        </svg>
      </div>
      <s-badge tone={tone}>{verdict}</s-badge>
      {caption && <s-text color="subdued">{caption}</s-text>}
    </s-stack>
  );
}
