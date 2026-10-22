/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WeekdayStyle = 'long' | 'short' | 'narrow';

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

// 2024-01-01 is a Monday; names are read in UTC so the host zone never shifts the day.
const MONDAY_UTC = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

export function isIsoWeekday(value: unknown): value is IsoWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Localized weekday name, independent of the host time zone. */
export function weekdayName(
  day: IsoWeekday,
  locale?: string,
  style: WeekdayStyle = 'long'
): string {
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(MONDAY_UTC + (day - 1) * DAY_MS)
  );
}

/** The seven weekdays in display order for a week that starts on `weekStartsOn`. */
export function orderedWeekdays(weekStartsOn: IsoWeekday = 1): IsoWeekday[] {
  return ISO_WEEKDAYS.map((_, i) => (((weekStartsOn - 1 + i) % 7) + 1) as IsoWeekday);
}

/** Drops anything that is not an ISO weekday, removes duplicates and sorts Monday first. */
export function normalizeWeekdays(values: readonly unknown[]): IsoWeekday[] {
  return [...new Set(values.filter(isIsoWeekday))].sort((a, b) => a - b);
}

/** Adds the day when absent, removes it when present; the result stays normalized. */
export function toggleWeekday(values: readonly IsoWeekday[], day: IsoWeekday): IsoWeekday[] {
  return values.includes(day)
    ? normalizeWeekdays(values.filter((d) => d !== day))
    : normalizeWeekdays([...values, day]);
}

/** Options for a single-weekday `Select` (values are the ISO numbers as strings). */
export function weekdayOptions(
  locale?: string,
  weekStartsOn: IsoWeekday = 1
): { value: string; label: string }[] {
  return orderedWeekdays(weekStartsOn).map((day) => ({
    value: String(day),
    label: weekdayName(day, locale),
  }));
}

/** A short English summary of a weekday set: "Every day", "Weekdays", "Weekends" or a list. */
export function describeWeekdays(values: readonly IsoWeekday[], locale?: string): string {
  const days = normalizeWeekdays(values);
  const key = days.join('');
  if (key === '') return 'No days';
  if (key === '1234567') return 'Every day';
  if (key === '12345') return 'Weekdays';
  if (key === '67') return 'Weekends';
  const names = days.map((d) => weekdayName(d, locale, 'short'));
  return new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(names);
}
