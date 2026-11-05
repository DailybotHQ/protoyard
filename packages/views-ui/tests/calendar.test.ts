import { setMountedRuntime } from '@protoyard/renderer-svelte';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
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

describe('CalendarView phone agenda (D-G-035)', () => {
  const BUSY: CalendarSeries<Data>[] = [
    ...SERIES,
    ...['Design sync', 'Lunch talk', 'Pairing', 'Retro'].map((title, index) => ({
      id: `b${index}`,
      start: `2026-10-20T1${index + 1}:00:00.000Z`,
      end: `2026-10-20T1${index + 1}:30:00.000Z`,
      allDay: false,
      timeZone: 'UTC',
      data: { title },
    })),
  ];
  const getTitle = (o: unknown) => (o as { data?: Data }).data?.title ?? 'Event';

  function phone(props: Record<string, unknown> = {}) {
    return render(CalendarView<Data>, {
      props: {
        query: query(BUSY),
        timeZone: 'UTC',
        anchor: '2026-10-20',
        now: '2026-10-20T08:00:00.000Z',
        getTitle,
        phone: true,
        ...props,
      },
    });
  }

  it('lists days with their events instead of the grid', async () => {
    phone();
    const day = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-agenda-day="2026-10-20"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(document.querySelector('[data-month-grid]')).toBeNull();
    expect(day.getAttribute('data-today')).toBe('true');
    expect(day.textContent).toContain('Standup');
    expect(day.textContent).toContain('9:00');
    expect(document.querySelector('[data-agenda-day="2026-10-21"]')?.textContent).toContain(
      'Offsite'
    );
    expect(document.querySelectorAll('[data-agenda-day]').length).toBe(7);
  });

  it('collapses a busy day behind "+N more events" and expands it', async () => {
    phone({ maxPerDay: 2 });
    const more = await screen.findByRole('button', { name: /3 more events/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    const day = document.querySelector('[data-agenda-day="2026-10-20"]') as HTMLElement;
    expect(day.querySelectorAll('[data-agenda-event]').length).toBe(2);
    await fireEvent.click(more);
    expect(day.querySelectorAll('[data-agenda-event]').length).toBe(5);
    const fewer = screen.getByRole('button', { name: 'Show fewer' });
    expect(fewer.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders events through the chip snippet and opens them', async () => {
    const onOpen = vi.fn();
    const chip = createRawSnippet(
      (_occurrence: () => unknown, state: () => { title: string; when: string; tone: string }) => ({
        render: () =>
          `<span class="chip">${state().title} @ ${state().when} [${state().tone}]</span>`,
      })
    );
    phone({ chip, onOpen, getTone: () => 'success' });
    const button = await screen.findByRole('button', { name: /Standup @ .*9:00.* \[success\]/ });
    await fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 's1' }));
  });

  it('pages by agendaDays and returns to today', async () => {
    phone({ agendaDays: 3 });
    await screen.findByRole('button', { name: 'Next period' });
    expect(document.querySelectorAll('[data-agenda-day]').length).toBe(3);
    await fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    await waitFor(() =>
      expect(document.querySelector('[data-agenda-day="2026-10-23"]')).not.toBeNull()
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(document.querySelector('[data-agenda-day="2026-10-20"]')).not.toBeNull()
    );
  });

  it('creates an all-day slot on a day through onCreate', async () => {
    const onCreate = vi.fn(async (_slot: { date: string; allDay: boolean }) => {});
    phone({ onCreate });
    const add = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-agenda-create="2026-10-22"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(add.getAttribute('aria-label')).toMatch(/^Add event on /);
    await fireEvent.click(add);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ date: '2026-10-22', allDay: true });
  });

  it('passes label overrides through to the Texuli month view overflow', async () => {
    render(CalendarView<Data>, {
      props: {
        query: query(BUSY),
        timeZone: 'UTC',
        anchor: '2026-10-20',
        now: '2026-10-20T08:00:00.000Z',
        view: 'month',
        getTitle,
        labels: { moreEvents: (count: number) => `+${count} more` },
      },
    });
    await waitFor(() => expect(document.body.textContent).toContain('+2 more'));
  });
});
