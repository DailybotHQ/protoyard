import { describe, expect, it } from 'vitest';
import {
  addDays,
  type CalendarSeries,
  dayBounds,
  daysBetween,
  expandAll,
  expandSeries,
  formatRRule,
  layoutDay,
  MAX_OCCURRENCES,
  monthGrid,
  occurrenceIndex,
  parseIsoDate,
  parseRRule,
  RecurrenceRuleSchema,
  splitSeries,
  stepAnchor,
  toIso,
  visibleRange,
  weekDates,
  weekStartFor,
  zonedInstant,
} from '../src/calendar/index.ts';

const NY = 'America/New_York';
const BERLIN = 'Europe/Berlin';

const starts = (series: CalendarSeries, start: string, end: string, timeZone?: string) =>
  expandSeries(series, { start, end }, timeZone ? { timeZone } : {}).occurrences.map(
    (o) => o.start
  );

let nextId = 0;
const newId = () => `series-${++nextId}`;

describe('dates and zones', () => {
  it('does civil date arithmetic across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(() => parseIsoDate('2026-02-30')).toThrow(RangeError);
  });

  it('knows DST days are 23 and 25 hours long', () => {
    const hours = (date: string, zone: string) => {
      const { start, end } = dayBounds(date, zone);
      return (end - start) / 3_600_000;
    };
    expect(hours('2026-03-08', NY)).toBe(23);
    expect(hours('2026-11-01', NY)).toBe(25);
    expect(hours('2026-03-29', BERLIN)).toBe(23);
    expect(hours('2026-10-25', BERLIN)).toBe(25);
    expect(hours('2026-06-01', NY)).toBe(24);
  });

  it('moves a skipped wall time forward and takes the earlier of a repeated one', () => {
    const at = (zone: string, month: number, day: number, hour: number, minute: number) =>
      toIso(zonedInstant({ year: 2026, month, day, hour, minute, second: 0 }, zone));
    expect(at(NY, 3, 8, 2, 30)).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    expect(at(NY, 11, 1, 1, 30)).toBe('2026-11-01T05:30:00.000Z'); // the EDT 01:30
    expect(at(BERLIN, 10, 25, 2, 30)).toBe('2026-10-25T00:30:00.000Z'); // the CEST 02:30
    expect(at(BERLIN, 3, 29, 2, 30)).toBe('2026-03-29T01:30:00.000Z'); // 03:30 CEST
  });
});

describe('grids', () => {
  it('reads the week start from the locale', () => {
    expect(weekStartFor('en-US')).toBe(0);
    expect(weekStartFor('fr-FR')).toBe(1);
    expect(weekStartFor('not a locale')).toBe(1);
  });

  it('builds a six-week month grid from the week start', () => {
    const grid = monthGrid(2026, 10, { weekStartsOn: 1, today: '2026-10-19' });
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toEqual({ date: '2026-09-28', inMonth: false, isToday: false });
    expect(grid[0]?.[3]?.date).toBe('2026-10-01');
    expect(grid.flat().filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid.flat().find((cell) => cell.isToday)?.date).toBe('2026-10-19');
    expect(monthGrid(2026, 10, { weekStartsOn: 0 })[0]?.[0]?.date).toBe('2026-09-27');
  });

  it('computes week dates and the visible range of every view', () => {
    expect(weekDates('2026-10-21', 0)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    const options = { weekStartsOn: 1 as const, timeZone: NY };
    expect(visibleRange('month', '2026-10-19', options)).toEqual({
      startDate: '2026-09-28',
      endDate: '2026-11-09',
      start: '2026-09-28T04:00:00.000Z',
      end: '2026-11-09T05:00:00.000Z',
    });
    expect(visibleRange('week', '2026-10-21', options).startDate).toBe('2026-10-19');
    expect(visibleRange('day', '2026-11-01', options)).toMatchObject({
      start: '2026-11-01T04:00:00.000Z',
      end: '2026-11-02T05:00:00.000Z',
    });
    expect(visibleRange('agenda', '2026-10-19', { ...options, agendaDays: 7 }).endDate).toBe(
      '2026-10-26'
    );
    expect(stepAnchor('month', '2026-12-15', 1)).toBe('2027-01-01');
    expect(stepAnchor('week', '2026-10-19', -1)).toBe('2026-10-12');
  });
});

describe('recurrence', () => {
  const standup: CalendarSeries = {
    id: 'standup',
    start: '2026-10-05T13:00:00.000Z', // Monday 09:00 New York (EDT)
    end: '2026-10-05T13:15:00.000Z',
    timeZone: NY,
    rule: { freq: 'weekly', byDay: ['MO', 'WE', 'FR'] },
  };

  it('repeats weekly on several days at the same wall time across DST', () => {
    const list = starts(standup, '2026-10-30T00:00:00Z', '2026-11-05T00:00:00Z');
    // Fri Oct 30 (EDT), then Mon Nov 2 and Wed Nov 4 after the switch to EST.
    expect(list).toEqual([
      '2026-10-30T13:00:00.000Z',
      '2026-11-02T14:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
    ]);
  });

  it('supports intervals, BYMONTHDAY (including negative), ordinals and skips', () => {
    const base = { id: 'x', start: '2026-01-31T10:00:00.000Z', end: '2026-01-31T11:00:00.000Z' };
    expect(
      starts(
        { ...base, rule: { freq: 'daily', interval: 10, count: 3 } },
        '2026-01-01T00:00:00Z',
        '2027-01-01T00:00:00Z'
      )
    ).toEqual(['2026-01-31T10:00:00.000Z', '2026-02-10T10:00:00.000Z', '2026-02-20T10:00:00.000Z']);
    // The 31st only exists in some months: RFC 5545 skips the others.
    expect(
      starts(
        { ...base, rule: { freq: 'monthly', count: 3 } },
        '2026-01-01T00:00:00Z',
        '2027-01-01T00:00:00Z'
      )
    ).toEqual(['2026-01-31T10:00:00.000Z', '2026-03-31T10:00:00.000Z', '2026-05-31T10:00:00.000Z']);
    const lastDay = { ...base, rule: { freq: 'monthly' as const, byMonthDay: [-1], count: 3 } };
    expect(
      starts(lastDay, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z').map((s) => s.slice(0, 10))
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    const secondTuesday = {
      ...base,
      start: '2026-01-13T10:00:00.000Z',
      end: '2026-01-13T11:00:00.000Z',
    };
    expect(
      starts(
        { ...secondTuesday, rule: { freq: 'monthly', byDay: ['2TU'], count: 3 } },
        '2026-01-01T00:00:00Z',
        '2027-01-01T00:00:00Z'
      ).map((s) => s.slice(0, 10))
    ).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
    const lastFriday = {
      ...base,
      start: '2026-01-30T10:00:00.000Z',
      end: '2026-01-30T11:00:00.000Z',
    };
    expect(
      starts(
        { ...lastFriday, rule: { freq: 'monthly', byDay: ['-1FR'], count: 2 } },
        '2026-01-01T00:00:00Z',
        '2027-01-01T00:00:00Z'
      ).map((s) => s.slice(0, 10))
    ).toEqual(['2026-01-30', '2026-02-27']);
    const leap = {
      id: 'leap',
      start: '2028-02-29T12:00:00.000Z',
      end: '2028-02-29T13:00:00.000Z',
      rule: { freq: 'yearly' as const, count: 2 },
    };
    expect(
      starts(leap, '2028-01-01T00:00:00Z', '2040-01-01T00:00:00Z').map((s) => s.slice(0, 10))
    ).toEqual(['2028-02-29', '2032-02-29']);
  });

  it('counts EXDATEs toward COUNT and treats UNTIL as inclusive', () => {
    const daily: CalendarSeries = {
      id: 'd',
      start: '2026-10-01T09:00:00.000Z',
      end: '2026-10-01T10:00:00.000Z',
      rule: { freq: 'daily', count: 3 },
      exdates: ['2026-10-02T09:00:00.000Z'],
    };
    expect(starts(daily, '2026-09-01T00:00:00Z', '2026-12-01T00:00:00Z')).toEqual([
      '2026-10-01T09:00:00.000Z',
      '2026-10-03T09:00:00.000Z',
    ]);
    const until = {
      ...daily,
      exdates: [],
      rule: { freq: 'daily' as const, until: '2026-10-04T09:00:00Z' },
    };
    expect(starts(until, '2026-09-01T00:00:00Z', '2026-12-01T00:00:00Z')).toHaveLength(4);
  });

  it('applies overrides, including moves into and out of the window', () => {
    const series: CalendarSeries<{ title: string }> = {
      ...standup,
      data: { title: 'Standup' },
      overrides: {
        // Wed Oct 7 moved to Thu Oct 15 (into the window below)
        '2026-10-07T13:00:00.000Z': {
          start: '2026-10-15T13:00:00.000Z',
          end: '2026-10-15T13:15:00.000Z',
        },
        // Mon Oct 12 moved out of the window to Oct 30, with its own title
        '2026-10-12T13:00:00.000Z': {
          start: '2026-10-30T15:00:00.000Z',
          end: '2026-10-30T15:15:00.000Z',
          data: { title: 'Moved standup' },
        },
      },
    };
    const { occurrences } = expandSeries(series, {
      start: '2026-10-12T00:00:00Z',
      end: '2026-10-17T00:00:00Z',
    });
    expect(
      occurrences.map((o) => [o.occurrenceId.slice(0, 10), o.start.slice(0, 10), o.overridden])
    ).toEqual([
      ['2026-10-14', '2026-10-14', false],
      ['2026-10-07', '2026-10-15', true],
      ['2026-10-16', '2026-10-16', false],
    ]);
    const later = expandSeries(series, {
      start: '2026-10-30T14:00:00Z',
      end: '2026-10-30T16:00:00Z',
    }).occurrences;
    expect(later.map((o) => o.data?.title)).toEqual(['Moved standup']);
  });

  it('caps an expansion at 1,000 occurrences and reports truncation', () => {
    const minutely: CalendarSeries = {
      id: 'm',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:30:00.000Z',
      rule: { freq: 'daily' },
    };
    const huge = expandSeries(
      minutely,
      { start: '2026-01-01T00:00:00Z', end: '2036-01-01T00:00:00Z' },
      { max: 5000 }
    );
    expect(huge.occurrences).toHaveLength(MAX_OCCURRENCES);
    expect(huge.truncated).toBe(true);
    const few = expandSeries(
      minutely,
      { start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' },
      { max: 10 }
    );
    expect(few.occurrences).toHaveLength(10);
    // A window years later skips ahead instead of generating from the start.
    const far = expandSeries(minutely, {
      start: '2035-06-01T00:00:00Z',
      end: '2035-06-03T00:00:00Z',
    });
    expect(far.occurrences.map((o) => o.start)).toEqual([
      '2035-06-01T00:00:00.000Z',
      '2035-06-02T00:00:00.000Z',
    ]);
  });

  it('orders occurrences of many series stably and expands all-day series by date', () => {
    const allDay: CalendarSeries = {
      id: 'b-holiday',
      start: '2026-10-19',
      end: '2026-10-20',
      allDay: true,
      rule: { freq: 'weekly', count: 2 },
    };
    const timed: CalendarSeries = {
      id: 'a-call',
      start: '2026-10-19T04:00:00.000Z',
      end: '2026-10-19T05:00:00.000Z',
    };
    const result = expandAll(
      [allDay, timed],
      { start: '2026-10-19T00:00:00Z', end: '2026-10-27T00:00:00Z' },
      { timeZone: 'UTC' }
    );
    expect(result.occurrences.map((o) => `${o.seriesId}:${o.start}`)).toEqual([
      'b-holiday:2026-10-19',
      'a-call:2026-10-19T04:00:00.000Z',
      'b-holiday:2026-10-26',
    ]);
    expect(result.occurrences[0]).toMatchObject({
      allDay: true,
      end: '2026-10-20',
      recurring: true,
    });
  });

  it('parses and formats RRULE strings, and validates rules', () => {
    const rule = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z');
    expect(rule).toEqual({
      freq: 'weekly',
      interval: 2,
      byDay: ['MO', 'WE'],
      until: '2026-12-31T23:59:59Z',
    });
    expect(formatRRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z');
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=4')).toEqual({
      freq: 'monthly',
      byMonthDay: [-1],
      count: 4,
    });
    expect(() => parseRRule('FREQ=HOURLY')).toThrow();
    expect(RecurrenceRuleSchema.safeParse({ freq: 'daily', interval: 0 }).success).toBe(false);
    expect(RecurrenceRuleSchema.safeParse({ freq: 'monthly', byDay: ['6MO'] }).success).toBe(false);
  });
});

describe('splitSeries', () => {
  const weekly: CalendarSeries<{ title: string }> = {
    id: 'review',
    start: '2026-10-05T14:00:00.000Z',
    end: '2026-10-05T15:00:00.000Z',
    rule: { freq: 'weekly' },
    exdates: ['2026-10-19T14:00:00.000Z'],
    overrides: {
      '2026-10-26T14:00:00.000Z': {
        start: '2026-10-26T16:00:00.000Z',
        end: '2026-10-26T17:00:00.000Z',
      },
    },
    data: { title: 'Review' },
  };
  const third = '2026-10-19T14:00:00.000Z';
  const second = '2026-10-12T14:00:00.000Z';

  it('"this" stores an override, or an EXDATE for a delete', () => {
    const moved = splitSeries(
      weekly,
      second,
      'this',
      { start: '2026-10-13T14:00:00.000Z', end: '2026-10-13T15:00:00.000Z' },
      { newId }
    );
    expect(moved.put[0]?.overrides?.[second]).toEqual({
      start: '2026-10-13T14:00:00.000Z',
      end: '2026-10-13T15:00:00.000Z',
    });
    const deleted = splitSeries(weekly, second, 'this', { delete: true }, { newId });
    expect(deleted.put[0]?.exdates).toEqual([second, third]);
  });

  it('"all" moves the series and re-keys its exceptions', () => {
    const result = splitSeries(
      weekly,
      second,
      'all',
      { start: '2026-10-12T15:00:00.000Z' },
      { newId }
    );
    const series = result.put[0];
    expect(series).toMatchObject({
      start: '2026-10-05T15:00:00.000Z',
      end: '2026-10-05T16:00:00.000Z',
    });
    expect(series?.exdates).toEqual(['2026-10-19T15:00:00.000Z']);
    expect(Object.keys(series?.overrides ?? {})).toEqual(['2026-10-26T15:00:00.000Z']);
    expect(splitSeries(weekly, second, 'all', { delete: true }, { newId })).toEqual({
      put: [],
      delete: ['review'],
    });
  });

  it('"following" ends the series before the occurrence and starts a new one', () => {
    const result = splitSeries(
      weekly,
      second,
      'following',
      { data: { title: 'Design review' } },
      { newId: () => 'review-2' }
    );
    const [head, tail] = result.put;
    expect(head?.rule).toEqual({ freq: 'weekly', until: '2026-10-12T13:59:59.000Z' });
    expect(head?.exdates).toBeUndefined();
    expect(tail).toMatchObject({ id: 'review-2', start: second, data: { title: 'Design review' } });
    expect(tail?.exdates).toEqual([third]);
    // Together they produce the same dates as before.
    const window = { start: '2026-10-01T00:00:00Z', end: '2026-11-03T00:00:00Z' };
    const before = expandSeries(weekly, window).occurrences.map((o) => o.start);
    const after = expandAll(result.put, window).occurrences.map((o) => o.start);
    expect(after).toEqual(before);
  });

  it('"following" splits COUNT between the two series', () => {
    const counted = {
      ...weekly,
      exdates: [],
      overrides: {},
      rule: { freq: 'weekly' as const, count: 5 },
    };
    expect(occurrenceIndex(counted, third)).toBe(2);
    const [head, tail] = splitSeries(
      counted,
      third,
      'following',
      { start: '2026-10-19T16:00:00.000Z' },
      { newId }
    ).put;
    expect(head?.rule?.count).toBe(2);
    expect(tail?.rule?.count).toBe(3);
    expect(tail?.start).toBe('2026-10-19T16:00:00.000Z');
  });

  it('treats "following" on the first occurrence as "all", and deletes the tail', () => {
    const first = splitSeries(
      weekly,
      weekly.start,
      'following',
      { start: '2026-10-05T15:00:00.000Z' },
      { newId }
    );
    expect(first.put).toHaveLength(1);
    expect(first.put[0]?.id).toBe('review');
    const cut = splitSeries(
      weekly,
      '2026-10-26T14:00:00.000Z',
      'following',
      { delete: true },
      { newId }
    );
    expect(cut.put).toHaveLength(1);
    expect(cut.put[0]?.rule?.until).toBe('2026-10-26T13:59:59.000Z');
  });

  it('edits single events directly and rejects unknown occurrences', () => {
    const single: CalendarSeries = {
      id: 'one',
      start: '2026-10-05T14:00:00.000Z',
      end: '2026-10-05T15:00:00.000Z',
    };
    expect(
      splitSeries(single, single.start, 'this', { end: '2026-10-05T16:00:00.000Z' }, { newId })
        .put[0]?.end
    ).toBe('2026-10-05T16:00:00.000Z');
    expect(() => splitSeries(weekly, '2026-10-13T14:00:00.000Z', 'this', {}, { newId })).toThrow(
      RangeError
    );
    expect(() => splitSeries(weekly, third, 'this', {}, { newId })).toThrow(RangeError); // excluded
  });
});

describe('layoutDay', () => {
  const event = (id: string, start: string, end: string) => ({ id, start, end });

  it('puts overlapping events side by side and keeps separate groups full width', () => {
    const items = layoutDay(
      [
        event('a', '2026-10-19T09:00:00Z', '2026-10-19T10:00:00Z'),
        event('b', '2026-10-19T09:30:00Z', '2026-10-19T11:00:00Z'),
        event('c', '2026-10-19T10:00:00Z', '2026-10-19T10:30:00Z'),
        event('d', '2026-10-19T13:00:00Z', '2026-10-19T14:00:00Z'),
      ],
      { date: '2026-10-19', timeZone: 'UTC' }
    );
    expect(
      items.map((i) => [i.event.id, i.column, i.columnCount, i.startMinute, i.endMinute])
    ).toEqual([
      ['a', 0, 2, 540, 600],
      ['b', 1, 2, 570, 660],
      ['c', 0, 2, 600, 630],
      ['d', 0, 1, 780, 840],
    ]);
  });

  it('places events by wall time on a spring-forward day (23 hours)', () => {
    const items = layoutDay(
      [
        event('night', '2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z'), // 01:30 EST → 03:30 EDT
        event('morning', '2026-03-08T13:00:00Z', '2026-03-08T14:00:00Z'), // 09:00 → 10:00 EDT
      ],
      { date: '2026-03-08', timeZone: NY }
    );
    expect(items.map((i) => [i.event.id, i.startMinute, i.endMinute])).toEqual([
      ['night', 90, 210],
      ['morning', 540, 600],
    ]);
  });

  it('keeps folded events visible on a fall-back day (25 hours)', () => {
    const items = layoutDay(
      [
        event('first', '2026-11-01T05:30:00Z', '2026-11-01T05:50:00Z'), // 01:30–01:50 EDT
        event('second', '2026-11-01T06:10:00Z', '2026-11-01T06:40:00Z'), // 01:10–01:40 EST
        event('late', '2026-11-02T03:00:00Z', '2026-11-02T06:00:00Z'), // 22:00 EST → past midnight
      ],
      { date: '2026-11-01', timeZone: NY }
    );
    const byId = Object.fromEntries(items.map((i) => [i.event.id, i]));
    // Both 01:xx events are drawn in the same wall-clock hour, so they get two columns.
    expect([byId.second?.column, byId.first?.column].sort()).toEqual([0, 1]);
    expect(byId.first?.columnCount).toBe(2);
    expect(byId.late).toMatchObject({ startMinute: 1320, endMinute: 1440, continuesAfter: true });
  });

  it('clips multi-day events, skips all-day ones and keeps a minimum height', () => {
    const items = layoutDay(
      [
        event('trip', '2026-10-18T20:00:00Z', '2026-10-19T08:00:00Z'),
        { ...event('holiday', '2026-10-19T00:00:00Z', '2026-10-20T00:00:00Z'), allDay: true },
        event('ping', '2026-10-19T12:00:00Z', '2026-10-19T12:00:00Z'),
        event('other-day', '2026-10-20T12:00:00Z', '2026-10-20T13:00:00Z'),
      ],
      { date: '2026-10-19', timeZone: 'UTC' }
    );
    expect(items.map((i) => i.event.id)).toEqual(['trip', 'ping']);
    expect(items[0]).toMatchObject({
      startMinute: 0,
      endMinute: 480,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(items[1]).toMatchObject({ startMinute: 720, endMinute: 735 });
  });
});
