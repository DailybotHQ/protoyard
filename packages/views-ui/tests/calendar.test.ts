import type { CalendarSeries } from '@protoyard/views/calendar';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  type CalendarChange,
  CalendarView,
  HOUR_PX,
  slotInstant,
} from '../src/calendar/index.ts';

afterEach(() => cleanup());

type Data = { title: string };
const NOW = new Date('2026-10-20T14:30:00.000Z'); // Tuesday

const SERIES: CalendarSeries<Data>[] = [
  {
    id: 'review',
    start: '2026-10-20T09:00:00.000Z',
    end: '2026-10-20T10:00:00.000Z',
    data: { title: 'Design review' },
  },
  {
    id: 'sync',
    start: '2026-10-19T15:00:00.000Z',
    end: '2026-10-19T15:30:00.000Z',
    rule: { freq: 'daily', count: 10 },
    data: { title: 'Team sync' },
  },
  {
    id: 'offsite',
    start: '2026-10-22',
    end: '2026-10-23',
    allDay: true,
    data: { title: 'Offsite' },
  },
];

const query = (current: CalendarSeries<Data>[] | undefined = SERIES, extra = {}) => ({
  current,
  loading: false,
  error: null,
  ...extra,
});

function setup(props: Record<string, unknown> = {}) {
  return render(CalendarView<Data>, {
    query: query(),
    now: NOW,
    timeZone: 'UTC',
    locale: 'en-US',
    view: 'week',
    ...props,
  } as never);
}

const view = () => document.querySelector('[data-calendar]')?.getAttribute('data-view');
const chip = (name: RegExp) => screen.getAllByRole('button', { name })[0] as HTMLElement;
const status = () => document.querySelector('[data-calendar-status]')?.textContent ?? '';
const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key: k, ...init });

/** A promise the test settles by hand, to observe the pending state. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CalendarView modes', () => {
  it('defaults to week on wide screens and switches with the buttons and M/W/D/A', async () => {
    render(CalendarView<Data>, { query: query(), now: NOW, timeZone: 'UTC' } as never);
    expect(view()).toBe('week');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Oct 18 – Oct 24, 2026');

    await fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(view()).toBe('month');
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeTruthy();
    expect(document.querySelectorAll('[data-month-grid] [data-slot]')).toHaveLength(42);

    const slot = document.querySelector('[data-slot][data-focused]') as HTMLElement;
    await key(slot, 'd');
    expect(view()).toBe('day');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Tuesday, October 20, 2026');
    await key(document.querySelector('[data-slot]') as HTMLElement, 'a');
    expect(view()).toBe('agenda');
    expect(
      screen.getByRole('heading', { level: 3, name: /Thursday, October 22, 2026/ })
    ).toBeTruthy();
    await key(document.querySelector('[data-slot]') as HTMLElement, 'w');
    expect(view()).toBe('week');
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('steps through ranges and returns to today', async () => {
    setup({ view: 'month' });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('November 2026');
    await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('October 2026');
  });

  it('expands recurrences, shows all-day events and "+N more" in month view', async () => {
    const busy = Array.from({ length: 4 }, (_, i) => ({
      id: `busy-${i}`,
      start: `2026-10-27T0${i + 1}:00:00.000Z`,
      end: `2026-10-27T0${i + 1}:30:00.000Z`,
      data: { title: `Busy ${i}` },
    }));
    setup({ view: 'month', query: query([...SERIES, ...busy]) });
    // Daily sync from Oct 19, ten occurrences.
    // Ten daily occurrences; the one on Oct 27 sits behind "+2 more" (busy day).
    expect(screen.getAllByRole('button', { name: /^Team sync/ })).toHaveLength(9);
    expect(screen.getByRole('button', { name: /^Offsite, All day/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '2 more events on Tuesday, October 27, 2026' })
    ).toBeTruthy();
  });

  it('draws the now-line from the clock and moves it when time advances', async () => {
    const { rerender } = setup();
    const line = () => document.querySelector('[data-now-line]') as HTMLElement | null;
    expect(line()?.style.top).toBe(`${14.5 * HOUR_PX}px`);
    await rerender({ now: new Date('2026-10-20T16:00:00.000Z') } as never);
    expect(line()?.style.top).toBe(`${16 * HOUR_PX}px`);
    await rerender({ now: new Date('2026-10-30T16:00:00.000Z') } as never);
    // The view keeps its week; today moved out of it, so no now-line.
    expect(line()).toBeNull();
  });
});

describe('CalendarView keyboard reschedule', () => {
  it('grabs with Space, moves by 15 minutes and days, saves with Enter through onChange', async () => {
    const save = deferred();
    const onChange = vi.fn((_change: CalendarChange<Data>) => save.promise);
    setup({ onChange });
    const event = chip(/^Design review/);
    expect(event.getAttribute('aria-roledescription')).toBe('draggable event');

    await key(event, ' ');
    expect(chip(/^Design review/).getAttribute('aria-pressed')).toBe('true');
    await key(chip(/^Design review/), 'ArrowDown');
    await key(chip(/^Design review/), 'ArrowDown');
    await key(chip(/^Design review/), 'ArrowRight');
    expect(status()).toMatch(/Wednesday, October 21, 2026, 9:30 AM – 10:30 AM\. Enter saves/);
    await key(chip(/^Design review/), 'Enter');

    expect(onChange).toHaveBeenCalledTimes(1);
    const change = onChange.mock.calls[0]?.[0] as CalendarChange<Data>;
    expect(change).toMatchObject({
      scope: 'this',
      start: '2026-10-21T09:30:00.000Z',
      end: '2026-10-21T10:30:00.000Z',
    });
    expect(change.writes.put[0]).toMatchObject({ id: 'review', start: '2026-10-21T09:30:00.000Z' });

    // Pending: drawn at the new time, busy until the service settles.
    await tick();
    expect(chip(/^Design review, 9:30 AM/).getAttribute('aria-busy')).toBe('true');
    save.resolve();
    await waitFor(() => expect(chip(/^Design review/).getAttribute('aria-busy')).toBeNull());
    expect(status()).toBe('Saved');
  });

  it('resizes with Shift+arrows and cancels with Escape', async () => {
    const onChange = vi.fn(async () => {});
    setup({ onChange });
    await key(chip(/^Design review/), ' ');
    await key(chip(/^Design review/), 'ArrowDown', { shiftKey: true });
    expect(chip(/^Design review/).getAttribute('aria-label')).toMatch(/9:00 AM – 10:15 AM/);
    await key(chip(/^Design review/), 'Escape');
    expect(chip(/^Design review/).getAttribute('aria-label')).toMatch(/9:00 AM – 10:00 AM/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rolls back when the service fails', async () => {
    const onChange = vi.fn(async () => {
      throw new Error('Simulated network is offline');
    });
    setup({ onChange });
    await key(chip(/^Design review/), ' ');
    await key(chip(/^Design review/), 'ArrowDown');
    await key(chip(/^Design review/), 'Enter');
    await waitFor(() => expect(status()).toMatch(/not saved/));
    expect(chip(/^Design review/).getAttribute('aria-label')).toMatch(/9:00 AM – 10:00 AM/);
    expect(chip(/^Design review/).getAttribute('aria-busy')).toBeNull();
  });

  it('is read-only without onChange: Space does not grab', async () => {
    setup();
    const event = chip(/^Design review/);
    expect(event.getAttribute('aria-roledescription')).toBeNull();
    await key(event, ' ');
    expect(chip(/^Design review/).getAttribute('aria-pressed')).toBeNull();
  });

  it('moves the focus slot with arrows and creates with Enter', async () => {
    const onCreate = vi.fn(async () => {});
    setup({ onCreate });
    const slot = document.querySelector('[data-slot][data-focused]') as HTMLElement;
    expect(slot.getAttribute('aria-label')).toBe(
      'Empty slot, Tuesday, October 20, 2026, 9:00 AM. Enter adds an event'
    );
    await key(slot, 'ArrowDown');
    await key(document.querySelector('[data-slot][data-focused]') as HTMLElement, 'ArrowRight');
    await tick();
    await fireEvent.click(document.querySelector('[data-slot][data-focused]') as HTMLElement);
    expect(onCreate).toHaveBeenCalledWith({
      date: '2026-10-21',
      start: '2026-10-21T09:15:00.000Z',
      end: '2026-10-21T10:15:00.000Z',
      allDay: false,
    });
  });

  it('creates an all-day event from a month day', async () => {
    const onCreate = vi.fn(async () => {});
    setup({ view: 'month', onCreate });
    await fireEvent.click(
      screen.getByRole('button', { name: /^Friday, October 30, 2026, no events/ })
    );
    expect(onCreate).toHaveBeenCalledWith({
      date: '2026-10-30',
      start: '2026-10-30',
      end: '2026-10-31',
      allDay: true,
    });
  });

  it('opens an event on click', async () => {
    const onOpen = vi.fn();
    setup({ onOpen });
    await fireEvent.click(chip(/^Design review/));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 'review' }));
  });
});

describe('CalendarView pointer and layout', () => {
  it('drags an event down in 15-minute steps and saves on release', async () => {
    const onChange = vi.fn(async (_change: CalendarChange<Data>) => {});
    setup({ onChange });
    const event = chip(/^Design review/);
    await fireEvent.pointerDown(event, { button: 0, clientX: 100, clientY: 100 });
    // 0.8 px per minute: 22 px is 27.5 minutes, which snaps to 30.
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 122 });
    expect(chip(/^Design review/).getAttribute('aria-label')).toMatch(/9:30 AM – 10:30 AM/);
    await fireEvent.pointerUp(window, { clientX: 100, clientY: 122 });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: '2026-10-20T09:30:00.000Z',
        end: '2026-10-20T10:30:00.000Z',
      })
    );
  });

  it('starts in agenda below sm', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('max-width'), media: q })) as never;
    try {
      render(CalendarView<Data>, { query: query(), now: NOW, timeZone: 'UTC' } as never);
      expect(view()).toBe('agenda');
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('CalendarView recurrence scope', () => {
  it('asks This / Following / All before saving a repeating event and splits the series', async () => {
    const onChange = vi.fn(async (_change: CalendarChange<Data>) => {});
    setup({ onChange, newId: () => 'sync-2' });
    const tuesday = screen
      .getAllByRole('button', { name: /^Team sync/ })
      .find((b) => b.closest('[data-day-column="2026-10-20"]')) as HTMLElement;
    await key(tuesday, ' ');
    await key(
      document.querySelector('[data-key][aria-pressed="true"]') as HTMLElement,
      'ArrowDown'
    );
    await key(document.querySelector('[data-key][aria-pressed="true"]') as HTMLElement, 'Enter');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Change a repeating event')).toBeTruthy();
    const radios = within(dialog).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.closest('label')?.textContent?.trim())).toEqual([
      'This event',
      'This and following events',
      'All events',
    ]);
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.click(radios[1] as HTMLInputElement);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const change = onChange.mock.calls[0]?.[0] as CalendarChange<Data>;
    expect(change.scope).toBe('following');
    expect(change.start).toBe('2026-10-20T15:15:00.000Z');
    expect(change.writes.put.map((s) => s.id).sort()).toEqual(['sync', 'sync-2']);
  });

  it('cancelling the scope dialog leaves the event where it was', async () => {
    const onChange = vi.fn(async () => {});
    setup({ onChange });
    const first = screen.getAllByRole('button', { name: /^Team sync/ })[1] as HTMLElement;
    await key(first, ' ');
    await key(
      document.querySelector('[data-key][aria-pressed="true"]') as HTMLElement,
      'ArrowDown'
    );
    await key(document.querySelector('[data-key][aria-pressed="true"]') as HTMLElement, 'Enter');
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(document.querySelector('[data-key][aria-pressed="true"]')).toBeNull()
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(status()).toBe('Change cancelled');
  });
});

describe('CalendarView data states and helpers', () => {
  it('shows the QueryState error with retry', async () => {
    const onRetry = vi.fn();
    setup({ query: query(undefined, { error: new Error('boom') }), onRetry });
    expect(screen.getByRole('alert').textContent).toContain('boom');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('applyMove keeps wall-clock time across DST and never shrinks below 15 minutes', () => {
    const zone = 'America/New_York';
    const start = new Date(slotInstant('2026-10-31', 9 * 60, zone)).toISOString();
    const end = new Date(slotInstant('2026-10-31', 10 * 60, zone)).toISOString();
    // Nov 1 2026 is the fall-back night in New York.
    const moved = applyMove(
      { start, end, allDay: false },
      { days: 2, minutes: 0, resize: 0 },
      zone
    );
    expect(moved.start).toBe(new Date(slotInstant('2026-11-02', 9 * 60, zone)).toISOString());
    const shrunk = applyMove(
      { start, end, allDay: false },
      { days: 0, minutes: 0, resize: -120 },
      zone
    );
    expect(Date.parse(shrunk.end) - Date.parse(shrunk.start)).toBe(15 * 60_000);
    expect(
      applyMove(
        { start: '2026-10-22', end: '2026-10-23', allDay: true },
        { days: 3, minutes: 30, resize: 0 },
        'UTC'
      )
    ).toEqual({ start: '2026-10-25', end: '2026-10-26' });
  });
});
