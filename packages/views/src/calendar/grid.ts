import {
  addDays,
  dayBounds,
  formatIsoDate,
  type IsoDate,
  parseIsoDate,
  toIso,
  weekdayOf,
} from './dates.ts';

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Regions whose week starts on Sunday or Saturday (CLDR); every other region starts on Monday.
const SUNDAY = new Set(
  'AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(
    ' '
  )
);
const SATURDAY = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '));

/**
 * The first day of the week for a BCP 47 locale (`en-US` → 0, `fr-FR` → 1).
 * Uses the runtime's `Intl.Locale` week info when it has one, else CLDR's
 * region table above; a locale without a region starts on Monday.
 */
export function weekStartFor(locale: string): Weekday {
  try {
    const intl = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = intl.getWeekInfo?.().firstDay ?? intl.weekInfo?.firstDay;
    if (firstDay !== undefined) return (firstDay % 7) as Weekday;
    const region = intl.maximize().region ?? '';
    if (SUNDAY.has(region)) return 0;
    if (SATURDAY.has(region)) return 6;
  } catch {
    // An invalid locale falls through to the ISO default.
  }
  return 1;
}

/** The first day of the week that contains `date`. */
export function startOfWeek(date: IsoDate, weekStartsOn: Weekday): IsoDate {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

/** The seven dates of the week that contains `date`. */
export function weekDates(date: IsoDate, weekStartsOn: Weekday): IsoDate[] {
  const start = startOfWeek(date, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface MonthCell {
  date: IsoDate;
  /** False for the leading and trailing days of the neighbor months. */
  inMonth: boolean;
  isToday: boolean;
}

/**
 * A month as six full weeks (42 cells), so the grid keeps its height from
 * month to month. `today` comes from the runtime clock, never `Date.now()`.
 */
export function monthGrid(
  year: number,
  month: number,
  options: { weekStartsOn: Weekday; today?: IsoDate }
): MonthCell[][] {
  const first = formatIsoDate(year, month, 1);
  const start = startOfWeek(first, options.weekStartsOn);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      return {
        date,
        inMonth: parseIsoDate(date).month === month,
        isToday: date === options.today,
      };
    })
  );
}

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export interface VisibleRange {
  /** First visible date. */
  startDate: IsoDate;
  /** Day after the last visible date (exclusive). */
  endDate: IsoDate;
  /** ISO instants of the range in `timeZone`, for querying and `expandSeries`. */
  start: string;
  end: string;
}

/** The dates (and instants) a view shows around `anchor`. */
export function visibleRange(
  view: CalendarView,
  anchor: IsoDate,
  options: { weekStartsOn: Weekday; timeZone: string; agendaDays?: number }
): VisibleRange {
  let startDate: IsoDate;
  let endDate: IsoDate;
  if (view === 'month') {
    const { year, month } = parseIsoDate(anchor);
    startDate = startOfWeek(formatIsoDate(year, month, 1), options.weekStartsOn);
    endDate = addDays(startDate, 42);
  } else if (view === 'week') {
    startDate = startOfWeek(anchor, options.weekStartsOn);
    endDate = addDays(startDate, 7);
  } else {
    startDate = anchor;
    endDate = addDays(anchor, view === 'day' ? 1 : (options.agendaDays ?? 14));
  }
  return {
    startDate,
    endDate,
    start: toIso(dayBounds(startDate, options.timeZone).start),
    end: toIso(dayBounds(endDate, options.timeZone).start),
  };
}

/** The anchor one view-length before (`-1`) or after (`1`) `anchor`. */
export function stepAnchor(
  view: CalendarView,
  anchor: IsoDate,
  step: -1 | 1,
  agendaDays = 14
): IsoDate {
  if (view === 'month') {
    const { year, month } = parseIsoDate(anchor);
    return formatIsoDate(year, month + step, 1);
  }
  return addDays(anchor, step * (view === 'week' ? 7 : view === 'day' ? 1 : agendaDays));
}
