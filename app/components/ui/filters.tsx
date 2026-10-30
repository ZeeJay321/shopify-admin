/** Toolbar pieces: segmented filter tabs and a result-count line. */

import type { ReactNode } from "react";

/** Segmented control built from s-press-button (Polaris has no tabs). */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T | null; label: string }>;
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <s-stack gap="small-200">
      <s-text accessibilityVisibility="exclusive">{label}</s-text>
      <s-stack direction="inline" gap="small-200">
        {options.map((option) => (
          <s-press-button
            key={option.value ?? "all"}
            pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </s-press-button>
        ))}
      </s-stack>
    </s-stack>
  );
}

/** Responsive toolbar: controls side by side when wide, stacked when narrow. */
export function Toolbar({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <s-query-container>
      <s-grid
        gap="base"
        alignItems="end"
        gridTemplateColumns={`@container (inline-size > 560px) repeat(${columns}, minmax(0, 1fr)), minmax(0, 1fr)`}
      >
        {children}
      </s-grid>
    </s-query-container>
  );
}
