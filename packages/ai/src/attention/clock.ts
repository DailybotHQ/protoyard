/**
 * Calendar helpers on a fixed offset table.
 *
 * No `Date.now`, no timezone library. Offsets match common prototype zones
 * on the simulated October 2026 dates used across Protoyard demos.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * UTC offsets (hours) for known zones. Unknown zones fall back to UTC.
 * Keep this table in sync with scenario fixtures that share the same zones.
 */
export const ATTENTION_TZ_OFFSET_HOURS: Record<string, number> = {
  'America/Bogota': -5,
  'Europe/Madrid': 2,
  'America/Los_Angeles': -7,
  'Asia/Kolkata': 5.5,
  'America/New_York': -4,
  UTC: 0,
};

function offsetHours(timezone: string): number {
  return ATTENTION_TZ_OFFSET_HOURS[timezone] ?? ATTENTION_TZ_OFFSET_HOURS.UTC ?? 0;
}

/** `YYYY-MM-DD` of an ISO instant in `timezone`. */
export function dayKey(iso: string, timezone: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 10);
  return new Date(parsed + offsetHours(timezone) * HOUR).toISOString().slice(0, 10);
}

/** Add calendar days to a `YYYY-MM-DD` key. UTC arithmetic; the key is already local. */
export function plusDays(isoDate: string, days: number): string {
  const parsed = Date.parse(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return isoDate.slice(0, 10);
  return new Date(parsed + days * DAY).toISOString().slice(0, 10);
}

/** Whole days between two ISO instants. Invalid input is 0. */
export function ageDays(updatedAt: string | undefined, now: string): number {
  if (!updatedAt) return 0;
  const from = Date.parse(updatedAt);
  const to = Date.parse(now);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / DAY;
}

/**
 * Working days strictly before `now`, most recent first, in the org timezone.
 * Weekends (Saturday/Sunday on the local day key) are skipped.
 */
export function previousWorkingDays(now: string, count: number, timezone: string): string[] {
  const days: string[] = [];
  let cursor = plusDays(dayKey(now, timezone), -1);
  while (days.length < count) {
    const utc = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
    if (utc !== 0 && utc !== 6) days.push(cursor);
    cursor = plusDays(cursor, -1);
  }
  return days;
}

/** True when `due` (date or ISO) falls in [today, today + days] in `timezone`. */
export function withinDays(
  due: string | null | undefined,
  now: string,
  days: number,
  timezone: string
): boolean {
  if (!due) return false;
  const today = dayKey(now, timezone);
  const end = plusDays(today, days);
  const dueDay = due.slice(0, 10);
  return dueDay >= today && dueDay <= end;
}

/** ISO instant at local `HH:mm` on `day` in `timezone`, with a numeric offset. */
export function localStamp(day: string, hhmm: string, timezone: string): string {
  const [hour, minute] = hhmm.split(':') as [string, string];
  const offset = offsetHours(timezone);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hours = String(Math.trunc(abs)).padStart(2, '0');
  const minutes = String(Math.round((abs - Math.trunc(abs)) * 60)).padStart(2, '0');
  return `${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00.000${sign}${hours}:${minutes}`;
}
