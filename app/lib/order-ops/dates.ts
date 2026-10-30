/**
 * Start of the current calendar day in a shop's IANA timezone, as an ISO
 * string with that zone's offset (e.g. "2026-10-30T00:00:00+05:00"), for
 * `created_at:>=` order searches. Falls back to UTC for unknown zones.
 */
export function startOfDayIso(now: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  // "GMT+05:30" -> "+05:30"; plain "GMT" means UTC.
  const offset = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T00:00:00${offset}`;
}

/** ISO timestamp `days` days before `now` (for the "recent" filter). */
export function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
