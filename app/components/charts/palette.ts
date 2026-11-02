/**
 * Chart colors. Tones come from lib/presentation (scoreTone, RISK_TONES,
 * SEVERITY_TONES, statusTone); this only turns a tone into a CSS variable
 * defined in charts.css. No literal colors here.
 */

import type { Tone } from "../../lib/presentation";

const TONE_VARS: Readonly<Record<Tone, string>> = {
  success: "var(--zj-c-success)",
  warning: "var(--zj-c-warning)",
  critical: "var(--zj-c-critical)",
  caution: "var(--zj-c-caution)",
  info: "var(--zj-c-info)",
  neutral: "var(--zj-c-neutral)",
};

/** Fill color for a mark with this tone. */
export function toneColor(tone: Tone): string {
  return TONE_VARS[tone];
}

/** Single-series accent for magnitude charts (not a status). */
export const ACCENT = TONE_VARS.info;

/** Chart chrome: ink, gridlines and tracks. */
export const INK = {
  text: "var(--zj-c-text)",
  secondary: "var(--zj-c-text-secondary)",
  grid: "var(--zj-c-grid)",
  axis: "var(--zj-c-axis)",
  track: "var(--zj-c-track)",
  surface: "var(--zj-c-surface)",
} as const;
