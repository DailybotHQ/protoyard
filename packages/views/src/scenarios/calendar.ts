import type { CalendarSeries } from '../calendar/index.ts';
import {
  addDays,
  dateIn,
  type IsoDate,
  parseIsoDate,
  toIso,
  weekdayOf,
  zonedInstant,
} from '../calendar/index.ts';
import {
  countFor,
  phrase,
  type ViewsCtx,
  type ViewsLevel,
  type ViewsPerson,
  viewsLevel,
  viewsRng,
} from './shared.ts';

export interface CalendarEventData {
  title: string;
  ownerId: string;
  kind: 'ritual' | 'meeting' | 'focus' | 'offsite';
}

export interface CalendarEventsOptions {
  people: readonly ViewsPerson[];
  /** Zone the events repeat in (default UTC). */
  timeZone?: string;
  level?: ViewsLevel;
}

const TOPICS = [
  'roadmap',
  'pricing',
  'onboarding',
  'launch',
  'hiring',
  'design',
  'billing',
  'support',
  'metrics',
];
const VERBS = ['Review', 'Sync on', 'Plan', 'Demo', 'Kickoff:', 'Deep dive:'];

function at(date: IsoDate, hour: number, minute: number, zone: string): string {
  return toIso(zonedInstant({ ...parseIsoDate(date), hour, minute, second: 0 }, zone));
}

function nextWorkday(date: IsoDate): IsoDate {
  let day = date;
  while ([0, 6].includes(weekdayOf(day))) day = addDays(day, 1);
  return day;
}

/**
 * Calendar series around the scenario reference time, in the calendar
 * engine's shape: weekly stand-ups (with one cancelled day and one moved
 * occurrence), a biweekly retro, a monthly review on the first Tuesday,
 * one-off meetings on working days and an all-day off-site. `edge` adds an
 * overlap, a meeting across midnight and a very long title.
 */
export function generateCalendarEvents(
  ctx: ViewsCtx,
  options: CalendarEventsOptions
): CalendarSeries<CalendarEventData>[] {
  const level = viewsLevel(ctx, 'calendar', options.level);
  if (level === 'empty' || options.people.length === 0) return [];
  const zone = options.timeZone ?? 'UTC';
  const rng = viewsRng(ctx, 'calendar');
  const today = dateIn(ctx.time.now.getTime(), zone);
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const owner = (i: number) => (options.people[i % options.people.length] as ViewsPerson).id;
  const series: CalendarSeries<CalendarEventData>[] = [];
  const add = (row: Omit<CalendarSeries<CalendarEventData>, 'id'>) =>
    series.push({ id: ctx.ids.next('event'), ...row });

  // Rituals: four weeks back, eight ahead.
  const standupStart = addDays(monday, -28);
  const standupDays = Array.from({ length: 60 }, (_, i) => addDays(standupStart, i)).filter(
    (d) => ![0, 6].includes(weekdayOf(d))
  );
  const cancelled = standupDays[rng.int(20, 25)] as IsoDate;
  const moved = standupDays[rng.int(26, 30)] as IsoDate;
  add({
    start: at(standupStart, 9, 30, zone),
    end: at(standupStart, 9, 45, zone),
    timeZone: zone,
    rule: {
      freq: 'weekly',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      until: at(addDays(monday, 56), 23, 59, zone),
    },
    exdates: [at(cancelled, 9, 30, zone)],
    overrides: {
      [at(moved, 9, 30, zone)]: { start: at(moved, 11, 0, zone), end: at(moved, 11, 15, zone) },
    },
    data: { title: 'Daily stand-up', ownerId: owner(0), kind: 'ritual' },
  });
  add({
    start: at(addDays(monday, -24), 15, 0, zone),
    end: at(addDays(monday, -24), 16, 0, zone),
    timeZone: zone,
    rule: { freq: 'weekly', interval: 2, byDay: ['FR'], count: 8 },
    data: { title: 'Sprint retro', ownerId: owner(1), kind: 'ritual' },
  });
  const { year, month } = parseIsoDate(today);
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstTuesday = addDays(firstOfMonth, (2 - weekdayOf(firstOfMonth) + 7) % 7);
  add({
    start: at(firstTuesday, 14, 0, zone),
    end: at(firstTuesday, 15, 30, zone),
    timeZone: zone,
    rule: { freq: 'monthly', byDay: ['1TU'], count: 6 },
    data: { title: 'Monthly business review', ownerId: owner(2), kind: 'ritual' },
  });

  // One-off meetings on working days within two weeks of today.
  const meetings = countFor(level, [0, 12, 80, 12]);
  for (let i = 0; i < meetings; i++) {
    const day = nextWorkday(addDays(today, rng.int(-14, 14)));
    const hour = rng.int(10, 16);
    const minute = rng.pick([0, 30]);
    const length = rng.pick([30, 45, 60, 90]);
    const startMs = Date.parse(at(day, hour, minute, zone));
    add({
      start: toIso(startMs),
      end: toIso(startMs + length * 60_000),
      timeZone: zone,
      data: {
        title: `${rng.pick(VERBS)} ${phrase(rng, TOPICS, 1)}`,
        ownerId: owner(i + 3),
        kind: rng.chance(0.2) ? 'focus' : 'meeting',
      },
    });
  }
  const offsite = nextWorkday(addDays(today, rng.int(5, 20)));
  add({
    start: offsite,
    end: addDays(offsite, 2),
    allDay: true,
    data: { title: 'Team off-site', ownerId: owner(4), kind: 'offsite' },
  });

  if (level === 'edge') {
    const day = nextWorkday(today);
    add({
      start: at(day, 10, 0, zone),
      end: at(day, 11, 0, zone),
      timeZone: zone,
      data: { title: 'Overlapping A', ownerId: owner(0), kind: 'meeting' },
    });
    add({
      start: at(day, 10, 15, zone),
      end: at(day, 10, 45, zone),
      timeZone: zone,
      data: { title: 'Overlapping B', ownerId: owner(1), kind: 'meeting' },
    });
    add({
      start: at(day, 23, 0, zone),
      end: at(addDays(day, 1), 1, 0, zone),
      timeZone: zone,
      data: { title: 'Release window (crosses midnight)', ownerId: owner(2), kind: 'focus' },
    });
    add({
      start: at(day, 16, 0, zone),
      end: at(day, 16, 30, zone),
      timeZone: zone,
      data: {
        title: `Quarterly planning ${'and alignment '.repeat(12).trim()}`,
        ownerId: owner(3),
        kind: 'meeting',
      },
    });
  }
  return series;
}
