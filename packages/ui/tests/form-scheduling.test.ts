import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Calendar from '../src/components/form/scheduling/Calendar.svelte';
import DatePicker from '../src/components/form/scheduling/DatePicker.svelte';
import DateRangePicker from '../src/components/form/scheduling/DateRangePicker.svelte';
import {
  addDays,
  addMonths,
  checkDateText,
  compareIsoDates,
  daysInMonth,
  formatIsoDate,
  isoDateFromInstant,
  isoWeekdayOf,
  monthGrid,
  normalizeDateRange,
  parseIsoDate,
  rangeLengthInDays,
  startOfWeek,
  validateDateRange,
} from '../src/components/form/scheduling/dates.ts';
import TimeInput from '../src/components/form/scheduling/TimeInput.svelte';
import TimeZoneSelect from '../src/components/form/scheduling/TimeZoneSelect.svelte';
import {
  formatTimeOfDay,
  fromTwelveHour,
  minuteSteps,
  minutesSinceMidnight,
  parseTimeOfDay,
  timeOfDayLabel,
  toTwelveHour,
} from '../src/components/form/scheduling/time.ts';
import {
  formatUtcOffset,
  isValidTimeZone,
  listTimeZones,
  matchesTimeZone,
  timeZoneOffsetMinutes,
  timeZoneOptions,
} from '../src/components/form/scheduling/timezones.ts';
import WeekdayPicker from '../src/components/form/scheduling/WeekdayPicker.svelte';
import {
  describeWeekdays,
  normalizeWeekdays,
  orderedWeekdays,
  toggleWeekday,
  weekdayName,
  weekdayOptions,
} from '../src/components/form/scheduling/weekdays.ts';
import * as barrel from '../src/index.ts';
import SchedulingFormHarness from './fixtures/SchedulingFormHarness.svelte';

afterEach(() => cleanup());

// A fixed instant stands in for the scenario clock: 2026-03-04T15:00:00Z (a Wednesday).
const NOW = Date.UTC(2026, 2, 4, 15, 0, 0);

describe('date helpers', () => {
  it('parses only real YYYY-MM-DD dates', () => {
    expect(parseIsoDate('2026-03-04')).toEqual({ year: 2026, month: 3, day: 4 });
    expect(parseIsoDate(' 2024-02-29 ')).toEqual({ year: 2024, month: 2, day: 29 });
    for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31']) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
    for (const bad of ['2026-3-4', '04/03/2026', '2026-03-04T00:00', '', 'tomorrow', 20260304]) {
      expect(parseIsoDate(bad), String(bad)).toBeNull();
    }
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('does calendar arithmetic without host time-zone drift', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    // Across the US and EU daylight-saving changes.
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonths('2026-03-04', 12)).toBe('2027-03-04');
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(compareIsoDates('2026-01-02', '2026-01-10')).toBeLessThan(0);
    expect(isoWeekdayOf('2026-03-04')).toBe(3);
    expect(isoWeekdayOf('2026-03-08')).toBe(7);
    expect(startOfWeek('2026-03-04', 1)).toBe('2026-03-02');
    expect(startOfWeek('2026-03-04', 7)).toBe('2026-03-01');
    expect(rangeLengthInDays('2026-03-01', '2026-03-01')).toBe(1);
    expect(rangeLengthInDays('2026-02-01', '2026-03-01')).toBe(29);
  });

  it('builds a stable six-week month grid', () => {
    const weeks = monthGrid(2026, 2, 1);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]?.[0]).toMatchObject({ date: '2026-01-26', inMonth: false, weekday: 1 });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(28);
    expect(monthGrid(2026, 2, 7)[0]?.[0]?.date).toBe('2026-02-01');
  });

  it('derives today from an instant in a given zone', () => {
    expect(isoDateFromInstant(NOW)).toBe('2026-03-04');
    expect(isoDateFromInstant(Date.UTC(2026, 2, 4, 2, 0), 'America/Bogota')).toBe('2026-03-03');
    expect(isoDateFromInstant(Date.UTC(2026, 2, 4, 20, 0), 'Asia/Tokyo')).toBe('2026-03-05');
    expect(formatIsoDate('2026-03-04', 'en-US')).toBe('Wednesday, March 4, 2026');
    expect(formatIsoDate('nope', 'en-US')).toBe('');
  });

  it('checks typed dates against format, bounds and availability', () => {
    const rules = {
      min: '2026-03-01',
      max: '2026-03-31',
      isDateDisabled: (d: string) => isoWeekdayOf(d) >= 6,
    };
    expect(checkDateText('', rules)).toEqual({ value: null, issue: null });
    expect(checkDateText('2026-03-04', rules)).toEqual({ value: '2026-03-04', issue: null });
    expect(checkDateText('2026-02-30', rules).issue).toBe('format');
    expect(checkDateText('2026-02-27', rules).issue).toBe('before-min');
    expect(checkDateText('2026-04-01', rules).issue).toBe('after-max');
    expect(checkDateText('2026-03-07', rules).issue).toBe('unavailable');
  });

  it('validates date ranges', () => {
    expect(validateDateRange({ start: null, end: null })).toBeNull();
    expect(validateDateRange({ start: null, end: null }, { required: true })).toBe('incomplete');
    expect(validateDateRange({ start: '2026-03-01', end: null })).toBe('incomplete');
    expect(validateDateRange({ start: '2026-02-30', end: '2026-03-01' })).toBe('invalid-start');
    expect(validateDateRange({ start: '2026-03-01', end: '2026-3-2' })).toBe('invalid-end');
    expect(validateDateRange({ start: '2026-03-05', end: '2026-03-01' })).toBe('end-before-start');
    expect(
      validateDateRange({ start: '2026-03-01', end: '2026-03-05' }, { max: '2026-03-04' })
    ).toBe('out-of-bounds');
    expect(validateDateRange({ start: '2026-03-01', end: '2026-03-08' }, { maxDays: 7 })).toBe(
      'too-long'
    );
    expect(
      validateDateRange({ start: '2026-03-01', end: '2026-03-07' }, { maxDays: 7 })
    ).toBeNull();
    expect(normalizeDateRange({ start: '2026-03-05', end: '2026-03-01' })).toEqual({
      start: '2026-03-01',
      end: '2026-03-05',
    });
  });
});

describe('time helpers', () => {
  it('parses and formats strict 24-hour times', () => {
    expect(parseTimeOfDay('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseTimeOfDay('23:59')).toEqual({ hour: 23, minute: 59 });
    for (const bad of ['24:00', '9:30', '12:60', '12:5', 'noon', '', null, 930]) {
      expect(parseTimeOfDay(bad), String(bad)).toBeNull();
    }
    expect(formatTimeOfDay({ hour: 7, minute: 5 })).toBe('07:05');
    expect(() => formatTimeOfDay({ hour: 24, minute: 0 })).toThrow(RangeError);
    expect(minutesSinceMidnight('01:30')).toBe(90);
    expect(minutesSinceMidnight('bad')).toBeNull();
  });

  it('converts between 12- and 24-hour clocks', () => {
    expect(toTwelveHour(0)).toEqual({ hour: 12, period: 'AM' });
    expect(toTwelveHour(12)).toEqual({ hour: 12, period: 'PM' });
    expect(toTwelveHour(17)).toEqual({ hour: 5, period: 'PM' });
    expect(fromTwelveHour(12, 'AM')).toBe(0);
    expect(fromTwelveHour(12, 'PM')).toBe(12);
    expect(fromTwelveHour(5, 'PM')).toBe(17);
    expect(timeOfDayLabel('00:15')).toBe('12:15 AM');
    expect(timeOfDayLabel('17:05', 24)).toBe('17:05');
    expect(timeOfDayLabel('bad')).toBe('');
  });

  it('steps minutes only by divisors of 60', () => {
    expect(minuteSteps(15)).toEqual([0, 15, 30, 45]);
    expect(minuteSteps(30)).toEqual([0, 30]);
    expect(minuteSteps(1)).toHaveLength(60);
    expect(minuteSteps(7)).toEqual([0, 15, 30, 45]);
    expect(minuteSteps(0)).toEqual([0, 15, 30, 45]);
  });
});

describe('weekday helpers', () => {
  it('names and orders ISO weekdays', () => {
    expect(weekdayName(1, 'en-US')).toBe('Monday');
    expect(weekdayName(7, 'en-US', 'short')).toBe('Sun');
    expect(orderedWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(orderedWeekdays(7)).toEqual([7, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOptions('en-US', 7)[0]).toEqual({ value: '7', label: 'Sunday' });
  });

  it('keeps weekday sets typed, unique and sorted', () => {
    expect(normalizeWeekdays([5, 1, 5, 9, 0, 2.5, '3', 7])).toEqual([1, 5, 7]);
    expect(toggleWeekday([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleWeekday([1, 2, 3], 2)).toEqual([1, 3]);
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeWeekdays([6, 7])).toBe('Weekends');
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(describeWeekdays([])).toBe('No days');
    expect(describeWeekdays([1, 3], 'en-US')).toBe('Mon & Wed');
  });
});

describe('time-zone helpers', () => {
  it('lists valid zones, always including UTC', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/Bogota');
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('computes offsets at a reference instant, including DST', () => {
    expect(timeZoneOffsetMinutes('UTC', NOW)).toBe(0);
    expect(timeZoneOffsetMinutes('America/Bogota', NOW)).toBe(-300);
    expect(timeZoneOffsetMinutes('Asia/Kolkata', NOW)).toBe(330);
    expect(timeZoneOffsetMinutes('America/New_York', Date.UTC(2026, 0, 15))).toBe(-300);
    expect(timeZoneOffsetMinutes('America/New_York', Date.UTC(2026, 6, 15))).toBe(-240);
    expect(formatUtcOffset(-300)).toBe('GMT-05:00');
    expect(formatUtcOffset(330)).toBe('GMT+05:30');
    expect(formatUtcOffset(0)).toBe('GMT+00:00');
  });

  it('builds sorted, searchable options and drops unknown zones', () => {
    const options = timeZoneOptions(NOW, ['Asia/Tokyo', 'Mars/Olympus', 'America/New_York', 'UTC']);
    expect(options.map((o) => o.label)).toEqual([
      '(GMT-05:00) America/New York',
      '(GMT+00:00) UTC',
      '(GMT+09:00) Asia/Tokyo',
    ]);
    const ny = options[0];
    expect(ny && matchesTimeZone(ny, 'new_york')).toBe(true);
    expect(ny && matchesTimeZone(ny, 'NEW YORK')).toBe(true);
    expect(ny && matchesTimeZone(ny, 'gmt-05')).toBe(true);
    expect(ny && matchesTimeZone(ny, 'tokyo')).toBe(false);
  });
});

/** Types into one segment of a Texuli date or time field. */
async function typeSegment(group: HTMLElement, name: string, value: string) {
  const input = within(group).getByRole('spinbutton', { name }) as HTMLInputElement;
  await fireEvent.input(input, { target: { value } });
}

/** Types a whole `YYYY-MM-DD` date into a segmented field group. */
async function typeDate(group: HTMLElement, iso: string) {
  const [year = '', month = '', day = ''] = iso.split('-');
  await typeSegment(group, 'Year', String(Number(year)));
  await typeSegment(group, 'Month', String(Number(month)));
  await typeSegment(group, 'Day', String(Number(day)));
}

/** Leaves a field group (blur to the page), which commits typed text. */
async function leave(group: HTMLElement) {
  await fireEvent.focusOut(group, { relatedTarget: null });
}

describe('Calendar', () => {
  it('renders a labelled grid that marks the simulated today and the selection', () => {
    // A clock far from the scenario's: the calendar must not read it.
    vi.useFakeTimers({ now: Date.UTC(2031, 6, 1), toFake: ['Date'] });
    try {
      render(Calendar, { selected: '2026-03-10', today: '2026-03-04', locale: 'en-US' });
      expect(screen.getByRole('group', { name: 'Choose a date' })).toBeTruthy();
      const grid = screen.getByRole('grid', { name: 'March 2026' });
      expect(within(grid).getAllByRole('columnheader')).toHaveLength(7);
      const today = within(grid).getByRole('button', { name: 'Wednesday, March 4, 2026' });
      expect(today.getAttribute('aria-current')).toBe('date');
      expect(grid.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
      const selected = within(grid).getByRole('button', { name: 'Tuesday, March 10, 2026' });
      expect(selected.closest('td')?.getAttribute('aria-selected')).toBe('true');
      // One tab stop: the selected date.
      expect(grid.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
      expect(selected.getAttribute('tabindex')).toBe('0');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves focus with arrows, Home/End and PageUp/PageDown', async () => {
    render(Calendar, { selected: '2026-03-31', today: '2026-03-04', locale: 'en-US' });
    const start = screen.getByRole('button', { name: 'Tuesday, March 31, 2026' });
    start.focus();
    const focused = () => document.activeElement?.getAttribute('data-calendar-date');
    await fireEvent.keyDown(start, { key: 'ArrowRight' });
    await waitFor(() => expect(focused()).toBe('2026-04-01'));
    expect(screen.getByRole('grid', { name: 'April 2026' })).toBeTruthy();
    await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(focused()).toBe('2026-04-08'));
    // Weeks start on Monday (ISO 1) by default.
    await fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    await waitFor(() => expect(focused()).toBe('2026-04-06'));
    await fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    await waitFor(() => expect(focused()).toBe('2026-04-12'));
    await fireEvent.keyDown(document.activeElement as Element, { key: 'PageUp' });
    await waitFor(() => expect(focused()).toBe('2026-03-12'));
    await fireEvent.keyDown(document.activeElement as Element, { key: 'PageDown', shiftKey: true });
    await waitFor(() => expect(focused()).toBe('2027-03-12'));
    await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    await waitFor(() => expect(focused()).toBe('2027-03-05'));
    await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    await waitFor(() => expect(focused()).toBe('2027-03-04'));
  });

  it('changes month from the header without picking', async () => {
    const onselect = vi.fn();
    render(Calendar, { selected: '2026-03-10', locale: 'en-US', onselect });
    await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'April 2026' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('grid', { name: 'February 2026' })).toBeTruthy();
    expect(onselect).not.toHaveBeenCalled();
  });

  it('picks available dates and refuses unavailable ones', async () => {
    const onselect = vi.fn();
    render(Calendar, {
      today: '2026-03-10',
      min: '2026-03-05',
      isDateDisabled: (d: string) => d === '2026-03-12',
      locale: 'en-US',
      onselect,
    });
    const early = screen.getByRole('button', { name: 'Wednesday, March 4, 2026' });
    const blocked = screen.getByRole('button', { name: 'Thursday, March 12, 2026' });
    expect(early.getAttribute('aria-disabled')).toBe('true');
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(early);
    await fireEvent.click(blocked);
    expect(onselect).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Friday, March 13, 2026' }));
    expect(onselect).toHaveBeenCalledExactlyOnceWith('2026-03-13');
  });

  it('starts the week on Sunday when asked', () => {
    render(Calendar, { today: '2026-03-10', weekStartsOn: 7, locale: 'en-US' });
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]?.getAttribute('aria-label')).toBe('Sunday');
  });

  it('highlights a range, picks a new one in two clicks and refuses one over maxDays', async () => {
    const onselect = vi.fn();
    const onRangeChange = vi.fn();
    const onInvalid = vi.fn();
    render(Calendar, {
      range: { start: '2026-03-10', end: '2026-03-12' },
      today: '2026-03-04',
      maxDays: 7,
      locale: 'en-US',
      onselect,
      onRangeChange,
      onInvalid,
    });
    const grid = screen.getByRole('grid', { name: 'March 2026' });
    expect(grid.getAttribute('aria-multiselectable')).toBe('true');
    const chosen = Array.from(grid.querySelectorAll('td[aria-selected="true"] button'));
    expect(chosen.map((b) => b.getAttribute('data-calendar-date'))).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ]);
    const day = (name: string) => within(grid).getByRole('button', { name });
    await fireEvent.click(day('Friday, March 20, 2026'));
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: '2026-03-20', end: null });
    await fireEvent.click(day('Monday, March 16, 2026'));
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: '2026-03-16', end: '2026-03-20' });
    expect(onselect.mock.calls.map((c) => c[0])).toEqual(['2026-03-20', '2026-03-16']);

    await fireEvent.click(day('Sunday, March 1, 2026'));
    await fireEvent.click(day('Monday, March 23, 2026'));
    expect(onInvalid).toHaveBeenCalledExactlyOnceWith('2026-03-01/2026-03-23', 'too-long');
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: '2026-03-01', end: null });
  });
});

describe('DatePicker', () => {
  it('commits a typed date when the field is left, not on every keystroke', async () => {
    const onValueChange = vi.fn();
    render(DatePicker, { 'aria-label': 'Due date', locale: 'en-US', onValueChange });
    const field = screen.getByRole('group', { name: 'Due date' });
    // Segments in the locale's order: month, day, year.
    expect(
      within(field)
        .getAllByRole('spinbutton')
        .map((s) => s.getAttribute('aria-label'))
    ).toEqual(['Month', 'Day', 'Year']);
    await typeDate(field, '2026-03-04');
    expect(onValueChange).not.toHaveBeenCalled();
    await leave(field);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('2026-03-04');
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Choose a date, Wednesday, March 4, 2026/ })
    ).toBeTruthy();
  });

  it('reports invalid, out-of-range and unavailable dates and keeps the value', async () => {
    const onValueChange = vi.fn();
    const onInvalid = vi.fn();
    render(DatePicker, {
      value: '2026-03-10',
      max: '2026-03-31',
      isDateDisabled: (d: string) => d === '2026-03-14',
      'aria-label': 'Due date',
      locale: 'en-US',
      onValueChange,
      onInvalid,
    });
    const field = screen.getByRole('group', { name: 'Due date' });
    const segment = (name: string) =>
      (within(field).getByRole('spinbutton', { name }) as HTMLInputElement).value;
    expect([segment('Month'), segment('Day'), segment('Year')]).toEqual(['3', '10', '2026']);

    await typeDate(field, '2026-02-30');
    await leave(field);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const message = screen.getByText('Enter a real date as YYYY-MM-DD.');
    expect(field.getAttribute('aria-describedby')).toContain(message.id);
    expect(onInvalid).toHaveBeenLastCalledWith('format', '2026-02-30');

    await typeDate(field, '2026-04-02');
    await leave(field);
    expect(screen.getByText('Choose 2026-03-31 or earlier.')).toBeTruthy();
    expect(onInvalid).toHaveBeenLastCalledWith('after-max', '2026-04-02');

    await typeDate(field, '2026-03-14');
    await leave(field);
    expect(onInvalid).toHaveBeenLastCalledWith('unavailable', '2026-03-14');
    expect(onValueChange).not.toHaveBeenCalled();

    for (const name of ['Month', 'Day', 'Year']) await typeSegment(field, name, '');
    await leave(field);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });

  it('opens the calendar from the button and picks a date at once', async () => {
    const onValueChange = vi.fn();
    render(DatePicker, {
      value: '2026-03-10',
      today: '2026-03-04',
      locale: 'en-US',
      'aria-label': 'Due date',
      onValueChange,
    });
    await fireEvent.click(screen.getByRole('button', { name: /Choose a date/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a date' });
    const grid = within(dialog).getByRole('grid', { name: 'March 2026' });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-calendar-date')).toBe('2026-03-10')
    );
    expect(
      within(grid)
        .getByRole('button', { name: 'Wednesday, March 4, 2026' })
        .getAttribute('aria-current')
    ).toBe('date');
    await fireEvent.click(within(grid).getByRole('button', { name: 'Friday, March 20, 2026' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('2026-03-20');
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
    const field = screen.getByRole('group', { name: 'Due date' });
    expect((within(field).getByRole('spinbutton', { name: 'Day' }) as HTMLInputElement).value).toBe(
      '20'
    );
  });
});

describe('DateRangePicker', () => {
  it('commits a complete typed range', async () => {
    const onValueChange = vi.fn();
    render(DateRangePicker, { locale: 'en-US', onValueChange });
    const range = screen.getByRole('group', { name: 'Date range' });
    const start = within(range).getByRole('group', { name: 'Start date' });
    const end = within(range).getByRole('group', { name: 'End date' });
    await typeDate(start, '2026-03-01');
    await leave(range);
    // A half-filled range waits quietly.
    expect(onValueChange).not.toHaveBeenCalled();
    expect(range.getAttribute('aria-invalid')).toBeNull();
    await typeDate(end, '2026-03-07');
    expect(onValueChange).not.toHaveBeenCalled();
    await leave(range);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith({
      start: '2026-03-01',
      end: '2026-03-07',
    });
  });

  it('rejects impossible, reversed and too-long ranges', async () => {
    const onValueChange = vi.fn();
    const onInvalid = vi.fn();
    render(DateRangePicker, {
      value: { start: '2026-03-01', end: '2026-03-03' },
      maxDays: 7,
      locale: 'en-US',
      onValueChange,
      onInvalid,
    });
    const range = screen.getByRole('group', { name: 'Date range' });
    const end = within(range).getByRole('group', { name: 'End date' });
    await typeSegment(end, 'Month', '2');
    await typeSegment(end, 'Day', '31');
    await leave(range);
    expect(screen.getByText('Enter the end date as YYYY-MM-DD.')).toBeTruthy();
    expect(range.getAttribute('aria-invalid')).toBe('true');
    await typeSegment(end, 'Day', '20');
    await leave(range);
    expect(screen.getByText('The end date must be on or after the start date.')).toBeTruthy();
    await typeSegment(end, 'Month', '3');
    await leave(range);
    expect(screen.getByText('The range is longer than allowed.')).toBeTruthy();
    expect(onInvalid.mock.calls.map((c) => c[0])).toEqual([
      'invalid-end',
      'end-before-start',
      'too-long',
    ]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('picks a range in two calendar clicks, swapping reversed ends', async () => {
    const onValueChange = vi.fn();
    render(DateRangePicker, {
      value: { start: '2026-03-10', end: '2026-03-12' },
      today: '2026-03-04',
      locale: 'en-US',
      onValueChange,
    });
    await fireEvent.click(screen.getByRole('button', { name: /Choose a date range/ }));
    const grid = await screen.findByRole('grid', { name: 'March 2026' });
    await fireEvent.click(within(grid).getByRole('button', { name: 'Friday, March 20, 2026' }));
    expect(screen.getByText('Start 2026-03-20. Now choose the end date.')).toBeTruthy();
    expect(onValueChange).not.toHaveBeenCalled();
    await fireEvent.click(within(grid).getByRole('button', { name: 'Monday, March 16, 2026' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith({
      start: '2026-03-16',
      end: '2026-03-20',
    });
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
  });

  it('refuses a calendar range over maxDays and keeps the dialog open', async () => {
    const onValueChange = vi.fn();
    const onInvalid = vi.fn();
    render(DateRangePicker, {
      value: { start: '2026-03-10', end: '2026-03-12' },
      today: '2026-03-04',
      maxDays: 7,
      locale: 'en-US',
      onValueChange,
      onInvalid,
    });
    await fireEvent.click(screen.getByRole('button', { name: /Choose a date range/ }));
    const grid = await screen.findByRole('grid', { name: 'March 2026' });
    await fireEvent.click(within(grid).getByRole('button', { name: 'Sunday, March 1, 2026' }));
    await fireEvent.click(within(grid).getByRole('button', { name: 'Monday, March 23, 2026' }));
    expect(onInvalid).toHaveBeenCalledExactlyOnceWith('too-long');
    expect(screen.getByText('The range is longer than allowed.')).toBeTruthy();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('grid', { name: 'March 2026' })).toBeTruthy();
  });
});

describe('TimeInput', () => {
  it('shows a 24-hour value in the 12-hour format and emits HH:mm', async () => {
    const onValueChange = vi.fn();
    render(TimeInput, { value: '17:30', label: 'Send at', onValueChange });
    const group = screen.getByRole('group', { name: 'Send at' });
    const hour = within(group).getByRole('spinbutton', { name: 'Hour' }) as HTMLInputElement;
    const minute = within(group).getByRole('spinbutton', { name: 'Minute' }) as HTMLInputElement;
    const period = within(group).getByRole('combobox', { name: 'AM or PM' }) as HTMLSelectElement;
    expect([hour.value, minute.value, period.value]).toEqual(['5', '30', 'PM']);
    await fireEvent.change(period, { target: { value: 'AM' } });
    expect(onValueChange).toHaveBeenLastCalledWith('05:30');
    await fireEvent.input(hour, { target: { value: '12' } });
    expect(onValueChange).toHaveBeenLastCalledWith('00:30');
  });

  it('waits for both hour and minute and steps minutes by the interval', async () => {
    const onValueChange = vi.fn();
    render(TimeInput, { format: 24, intervalMinutes: 30, onValueChange });
    const hour = screen.getByRole('spinbutton', { name: 'Hour' }) as HTMLInputElement;
    const minute = screen.getByRole('spinbutton', { name: 'Minute' }) as HTMLInputElement;
    expect(screen.queryByRole('combobox', { name: 'AM or PM' })).toBeNull();
    expect(minute.step).toBe('30');
    await fireEvent.input(hour, { target: { value: '23' } });
    expect(onValueChange).not.toHaveBeenCalled();
    await fireEvent.input(minute, { target: { value: '30' } });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('23:30');
    await fireEvent.keyDown(minute, { key: 'ArrowUp' });
    expect(onValueChange).toHaveBeenLastCalledWith('23:00');
  });

  it('keeps an off-step minute, ignores an invalid value and never emits an incomplete time', async () => {
    const onValueChange = vi.fn();
    render(TimeInput, { value: '08:07', format: 24, onValueChange });
    const minute = screen.getByRole('spinbutton', { name: 'Minute' }) as HTMLInputElement;
    expect(minute.value).toBe('7');
    await fireEvent.input(screen.getByRole('spinbutton', { name: 'Hour' }), {
      target: { value: '' },
    });
    expect(onValueChange).not.toHaveBeenCalled();
    cleanup();
    render(TimeInput, { value: '25:00', format: 24 });
    expect((screen.getByRole('spinbutton', { name: 'Hour' }) as HTMLInputElement).value).toBe('');
  });

  it('submits the value under its name', () => {
    const { container } = render(TimeInput, { value: '09:15', name: 'sendAt' });
    expect(container.querySelector<HTMLInputElement>('input[name="sendAt"]')?.value).toBe('09:15');
  });
});

describe('WeekdayPicker', () => {
  it('toggles days as a sorted ISO list', async () => {
    const onValueChange = vi.fn();
    render(WeekdayPicker, { value: [5, 1], locale: 'en-US', onValueChange });
    const group = screen.getByRole('group', { name: 'Days of the week' });
    const monday = within(group).getByRole('button', { name: 'Monday' });
    expect(monday.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(group).getByRole('button', { name: 'Tuesday' }).getAttribute('aria-pressed')
    ).toBe('false');
    await fireEvent.click(within(group).getByRole('button', { name: 'Wednesday' }));
    expect(onValueChange).toHaveBeenLastCalledWith([1, 3, 5]);
    await fireEvent.click(monday);
    expect(onValueChange).toHaveBeenLastCalledWith([3, 5]);
  });

  it('is one tab stop moved with arrows, Home and End', async () => {
    render(WeekdayPicker, { value: [3], weekStartsOn: 7, locale: 'en-US' });
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))[0]).toBe('Sunday');
    // Texuli's ToggleGroup: one tab stop for the whole group.
    expect(buttons.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
    const wednesday = screen.getByRole('button', { name: 'Wednesday' });
    expect(wednesday.getAttribute('aria-pressed')).toBe('true');
    wednesday.focus();
    await fireEvent.keyDown(wednesday, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Thursday');
    await fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Saturday');
    await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sunday');
    await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Saturday');
    await fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sunday');
    expect(screen.getByRole('button', { name: 'Sunday' }).getAttribute('tabindex')).toBe('0');
  });

  it('submits one form entry per selected day (ToggleGroup name) and respects disabled', () => {
    const { container } = render(WeekdayPicker, { value: [2, 4], name: 'days', disabled: true });
    const hidden = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="days"]'));
    expect(hidden.map((i) => i.value)).toEqual(['2', '4']);
    expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true
    );
  });
});

describe('TimeZoneSelect', () => {
  it('shows the current zone with its offset at the reference date', async () => {
    render(TimeZoneSelect, {
      value: 'America/Bogota',
      referenceDate: NOW,
      zones: ['UTC', 'America/Bogota', 'Asia/Tokyo'],
      'aria-label': 'Time zone',
    });
    const input = screen.getByRole('combobox', { name: 'Time zone' }) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('(GMT-05:00) America/Bogota'));
  });
});

describe('FormField integration', () => {
  it('takes the field id, description, invalid and required flags', () => {
    render(SchedulingFormHarness, { error: 'Fix this field' });
    // Texuli's time and date fields are groups of segments: the label targets the group.
    const time = screen.getByRole('group', { name: 'Send at' });
    const label = screen.getByText('Send at', { selector: 'label' });
    expect(label.getAttribute('for')).toBe(time.id);
    const hour = within(time).getByRole('spinbutton', { name: 'Hour' }) as HTMLInputElement;
    expect(hour.required).toBe(true);
    expect(time.getAttribute('aria-invalid')).toBe('true');
    expect(time.getAttribute('aria-describedby')).toContain(`${time.id}-description`);

    const days = screen.getByRole('group', { name: 'Repeat on' });
    expect(days.getAttribute('aria-describedby')).toContain(`${days.id}-error`);

    // DatePicker takes its name from FormField's `<label for>` (without the required marker).
    const starts = screen.getByRole('group', { name: 'Starts' });
    expect(screen.getByText('Starts', { selector: 'label' }).getAttribute('for')).toBe(starts.id);
    const year = within(starts).getByRole('spinbutton', { name: 'Year' }) as HTMLInputElement;
    expect(year.required).toBe(true);
    expect(starts.getAttribute('aria-invalid')).toBe('true');
    expect(starts.getAttribute('aria-describedby')).toContain(`${starts.id}-error`);
  });
});

describe('barrel', () => {
  it('exports the scheduling inputs and helpers from @protoyard/ui', () => {
    for (const name of [
      'Calendar',
      'DatePicker',
      'DateRangePicker',
      'TimeInput',
      'TimeZoneSelect',
      'WeekdayPicker',
      'parseIsoDate',
      'validateDateRange',
      'parseTimeOfDay',
      'timeZoneOptions',
      'normalizeWeekdays',
    ]) {
      expect(barrel, name).toHaveProperty(name);
    }
  });
});
