/** Number, money and time formatting with Intl (pure, locale-pinned). */

const LOCALE = "en-US";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** Count with Shopify's "at least" precision: 10,000+. */
export function formatCount(count: number, atLeast = false): string {
  return `${formatNumber(count)}${atLeast ? "+" : ""}`;
}

export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

/** 0.873 -> "87%". */
export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/** "Oct 30, 2026, 2:05 PM" (UTC, so server and client render the same). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (
    new Intl.DateTimeFormat(LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function formatRelative(iso: string, now: Date): string {
  const diffMs = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Share of a total as 0..1, safe for zero totals. */
export function ratio(part: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, part / total)) : 0;
}
