/**
 * Orders per calendar day in the shop's timezone (pure). Only days the
 * sample actually covers are returned, so a capped sample never shows
 * made-up zero days.
 */

export type DayCount = { date: string; count: number };

/** "YYYY-MM-DD" for an instant in `timeZone` (UTC for unknown zones). */
export function dayKey(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar arithmetic on a "YYYY-MM-DD" key (DST-safe). */
export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function ordersPerDay(
  createdAts: readonly string[],
  {
    now,
    timeZone,
    days,
    coveredFrom = null,
  }: {
    now: Date;
    timeZone: string;
    days: number;
    /** Oldest instant the data covers (capped samples); null = whole window. */
    coveredFrom?: string | null;
  },
): DayCount[] {
  const today = dayKey(now.toISOString(), timeZone);
  if (!today || days < 1) return [];
  const firstCovered = coveredFrom ? dayKey(coveredFrom, timeZone) : null;

  const counts = new Map<string, number>();
  for (const iso of createdAts) {
    const key = dayKey(iso, timeZone);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: DayCount[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = shiftDay(today, -offset);
    if (firstCovered && date < firstCovered) continue;
    result.push({ date, count: counts.get(date) ?? 0 });
  }
  return result;
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
