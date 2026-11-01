import { setMountedRuntime } from '@protoyard/renderer-svelte';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
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

  it('creates an event on a day slot through the service callback', async () => {
    const onCreate = vi.fn(async () => {});
    render(CalendarView<Data>, {
      props: {
        query: query(),
        timeZone: 'UTC',
        view: 'week',
        anchor: '2026-10-20',
        now: '2026-10-20T12:00:00.000Z',
        getTitle: (o) => (o as { data?: Data }).data?.title ?? 'Event',
        onCreate,
      },
    });
    const slot = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-slot="2026-10-22"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await fireEvent.click(slot);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(onCreate.mock.calls[0])).toContain('2026-10-22');
  });

  it('refuses edits when read-only: no slot creates and nothing moves', async () => {
    const onCreate = vi.fn(async () => {});
    const onChange = vi.fn(async () => {});
    render(CalendarView<Data>, {
      props: {
        query: query(),
        timeZone: 'UTC',
        view: 'week',
        anchor: '2026-10-20',
        now: '2026-10-20T12:00:00.000Z',
        getTitle: (o) => (o as { data?: Data }).data?.title ?? 'Event',
        onCreate,
        onChange,
        readOnly: true,
      },
    });
    await waitFor(() => expect(document.body.textContent).toContain('Standup'));
    expect(document.querySelector('[data-slot]')).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
