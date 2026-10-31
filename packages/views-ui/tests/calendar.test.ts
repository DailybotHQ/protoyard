import { setMountedRuntime } from '@protoyard/renderer-svelte';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/calendar/index.ts';

afterEach(() => cleanup());

interface Data {
  title: string;
}

const SERIES: CalendarSeries<Data>[] = [
  {
    id: 's1',
    start: '2026-10-20T09:00:00.000Z',
    end: '2026-10-20T10:00:00.000Z',
    allDay: false,
    timeZone: 'UTC',
    data: { title: 'Standup' },
  },
  {
    id: 's2',
    start: '2026-10-21',
    end: '2026-10-22',
    allDay: true,
    timeZone: 'UTC',
    data: { title: 'Offsite' },
  },
];

const query = (current: CalendarSeries<Data>[] | undefined = SERIES) => ({
  current,
  loading: false,
  error: undefined,
});

describe('CalendarView (Texuli host adapter)', () => {
  it('opens on the mounted runtime clock week when no runtime or now is passed', async () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const clock = {
      now: () => now,
      committed: () => now,
      reference: () => now,
      getState: () => ({ running: false }),
      subscribe: () => () => {},
    };
    setMountedRuntime({ clock } as never);
    try {
      render(CalendarView<Data>, {
        query: query(),
        timeZone: 'UTC',
        getTitle: (o) => (o as { data?: Data }).data?.title ?? 'Event',
      });
      await waitFor(() => expect(document.body.textContent).toContain('Standup'));
      expect(document.body.textContent).not.toContain('1970');
    } finally {
      setMountedRuntime(null);
    }
  });

  it('renders the calendar chrome and events from query', async () => {
    render(CalendarView<Data>, {
      query: query(),
      timeZone: 'UTC',
      getTitle: (o) => (o as { data?: Data }).data?.title ?? 'Event',
    });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Standup|October|Week|Month|Calendar/i)
    );
  });

  it('shows QueryState loading then content', async () => {
    vi.useFakeTimers();
    const view = render(CalendarView<Data>, {
      query: { current: undefined, loading: true, error: undefined },
      label: 'Team calendar',
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.getByRole('status', { name: 'Loading team calendar' })).toBeTruthy();
    vi.useRealTimers();
    await view.rerender({
      query: query(),
      label: 'Team calendar',
      getTitle: () => 'Standup',
    });
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Loading team calendar' })).toBeNull()
    );
  });

  it('exposes mode controls from Texuli calendar', async () => {
    render(CalendarView<Data>, {
      query: query(),
      view: 'week',
      getTitle: (o) => (o as { data?: Data }).data?.title ?? 'E',
    });
    // Mode buttons M/W/D/A or Week/Month labels
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  // Texuli gap (the lead assigns its id): @texuli/data/calendar EventButton names a timed
  // event "Title, <long date>, <time>, press Enter to open", but its visible text is
  // "Title <time>". The date splits the visible text, so axe flags
  // label-content-name-mismatch (WCAG 2.5.3) wherever the time shows (the phone agenda in
  // cadence-studio-demo). Expected: the visible text leads the name in order, e.g.
  // "Title, <time>, <long date>, press Enter to open". Flip to `it` when Texuli ships it.
  it.fails('a timed agenda event names itself starting with its visible text in order', async () => {
    render(CalendarView<Data>, {
      query: query(),
      view: 'agenda',
      timeZone: 'UTC',
      now: '2026-10-20T08:00:00.000Z',
      getTitle: (o) => (o as { data?: Data }).data?.title ?? 'Event',
    });
    const event = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('[data-calendar-event]');
      if (!node?.textContent?.includes('Standup')) throw new Error('not rendered');
      return node;
    });
    const words = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    const visible = words([...event.children].map((child) => child.textContent ?? '').join(' '));
    expect(visible).toMatch(/standup \d/);
    expect(words(event.getAttribute('aria-label') ?? '')).toContain(visible);
  });
});
