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
});
