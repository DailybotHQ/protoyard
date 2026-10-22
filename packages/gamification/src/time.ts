const DAY_MS = 86_400_000;

/** ISO week key `YYYY-Www` (weeks start on Monday, UTC). */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Consecutive ISO weeks with at least one action, ending this week or last
 * week. `actionDates` are ISO strings. Deterministic for a fixed `now`.
 */
export function streakWeeks(actionDates: readonly string[], now: Date): number {
  const weeks = new Set(
    actionDates
      .map((iso) => {
        const parsed = Date.parse(iso);
        return Number.isNaN(parsed) ? null : isoWeek(new Date(parsed));
      })
      .filter((week): week is string => week !== null)
  );
  let cursor = new Date(now);
  if (!weeks.has(isoWeek(cursor))) {
    cursor = new Date(cursor.getTime() - 7 * DAY_MS);
  }
  let count = 0;
  while (weeks.has(isoWeek(cursor))) {
    count += 1;
    cursor = new Date(cursor.getTime() - 7 * DAY_MS);
  }
  return count;
}

/** True when `now` is at or after an optional mission deadline. */
export function isPastDeadline(deadlineAt: string | undefined, now: Date): boolean {
  if (!deadlineAt) return false;
  const end = Date.parse(deadlineAt);
  if (Number.isNaN(end)) return false;
  return now.getTime() >= end;
}
