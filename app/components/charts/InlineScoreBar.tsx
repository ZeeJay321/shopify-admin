import { scoreTone, scoreVerdict } from "../../lib/presentation";
import { toneColor } from "./palette";

/** Table-cell score: the number plus a short tone bar. */
export function InlineScoreBar({ score }: { score: number }) {
  return (
    <div className="zj-inline-score">
      <span className="zj-num" style={{ minInlineSize: "2ch" }}>
        <s-text type="strong" accessibilityVisibility="hidden">
          {`${score}`}
        </s-text>
        <s-text accessibilityVisibility="exclusive">
          {`${score} out of 100, ${scoreVerdict(score).toLowerCase()}`}
        </s-text>
      </span>
      <div className="zj-track zj-track--thin" aria-hidden="true">
        <div
          className="zj-fill"
          style={{
            inlineSize: `${Math.min(100, Math.max(0, score))}%`,
            background: toneColor(scoreTone(score)),
          }}
        />
      </div>
    </div>
  );
}
