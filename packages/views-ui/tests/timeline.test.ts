import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineView } from '../src/timeline/index.ts';

afterEach(() => cleanup());

interface Task {
  id: string;
  title: string;
  start: string;
  end: string;
  project: string;
}

const TASKS: Task[] = [
  { id: 't1', title: 'Draft brief', start: '2026-10-05', end: '2026-10-07', project: 'apollo' },
  { id: 't2', title: 'Review copy', start: '2026-10-08', end: '2026-10-09', project: 'apollo' },
  { id: 't3', title: 'Pick vendor', start: '2026-10-06', end: '2026-10-12', project: 'birch' },
];

const PROJECTS: Record<string, { label: string; start: string; end: string }> = {
  apollo: { label: 'Apollo launch', start: '2026-10-05', end: '2026-10-09' },
  birch: { label: 'Birch refresh', start: '2026-10-06', end: '2026-10-12' },
};

const query = (current: Task[] = TASKS) => ({ current, loading: false, error: undefined });

function timeline(props: Record<string, unknown> = {}) {
  return render(TimelineView<Task>, {
    query: query(),
    now: new Date('2026-10-07T12:00:00.000Z'),
    getTitle: (task: Task) => task.title,
    ...props,
  });
}

const getGroup = (task: Task) => {
  const project = PROJECTS[task.project];
  if (!project) return undefined;
  return {
    id: task.project,
    label: project.label,
    band: { start: project.start, end: project.end, label: project.label, tone: 'info' as const },
  };
};

describe('TimelineView (Texuli 0.14 pass-through, D-G-044)', () => {
  it('renders a header row per group and collapses one with bind:collapsed', async () => {
    const onCollapsedChange = vi.fn();
    timeline({ getGroup, onCollapsedChange });
    const apollo = await screen.findByRole('button', { name: /Apollo launch/ });
    expect(apollo.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Birch refresh/ })).toBeTruthy();
    await fireEvent.click(apollo);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(['apollo']);
    expect(apollo.getAttribute('aria-expanded')).toBe('false');
  });

  it('starts with the groups named in collapsed folded', async () => {
    timeline({ getGroup, collapsed: ['birch'] });
    const birch = await screen.findByRole('button', { name: /Birch refresh/ });
    expect(birch.getAttribute('aria-expanded')).toBe('false');
  });

  it('runs onGroupAdd from a group header with the group and its items', async () => {
    const onGroupAdd = vi.fn(async (_group: { id: string; items: Task[] }) => {});
    timeline({ getGroup, onGroupAdd });
    const add = await screen.findByRole('button', { name: 'Add to Apollo launch' });
    expect(screen.getByRole('button', { name: 'Add to Birch refresh' })).toBeTruthy();
    await fireEvent.click(add);
    await waitFor(() => expect(onGroupAdd).toHaveBeenCalledTimes(1));
    const group = onGroupAdd.mock.calls[0]?.[0] as { id: string; items: Task[] };
    expect(group.id).toBe('apollo');
    expect(group.items.map((task) => task.id)).toEqual(['t1', 't2']);
  });

  it('selects a row through onRowSelect and marks it current', async () => {
    const onRowSelect = vi.fn();
    timeline({ onRowSelect });
    const row = await screen.findByRole('button', { name: 'Review copy' });
    await fireEvent.click(row);
    expect(onRowSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review copy' }).getAttribute('aria-current')).toBe(
        'true'
      )
    );
  });

  it('marks the row named by selectedRow', async () => {
    timeline({ onRowSelect: vi.fn(), selectedRow: 't3' });
    const row = await screen.findByRole('button', { name: 'Pick vendor' });
    expect(row.getAttribute('aria-current')).toBe('true');
  });

  it('truncates to maxRows with a notice', async () => {
    timeline({ maxRows: 2 });
    await waitFor(() => expect(document.body.textContent).toMatch(/2 of 3|1 hidden|hidden/i));
  });

  it('draws markers with their label', async () => {
    timeline({ markers: [{ at: '2026-10-10', label: 'Review window closes', tone: 'warning' }] });
    await waitFor(() => expect(document.body.textContent).toContain('Review window closes'));
  });

  it('passes formatTick and initialDate through to Texuli (0.14.2)', async () => {
    const formatTick = vi.fn((date: string, _context: { zoom: string }) => `tick ${date}`);
    timeline({ formatTick, initialDate: '2026-10-06' });
    await waitFor(() => expect(document.body.textContent).toContain('tick 2026-10-'));
    expect(formatTick).toHaveBeenCalled();
    expect(formatTick.mock.calls[0]?.[1]).toMatchObject({ zoom: 'week' });
  });

  it('exposes scrollToDate from Texuli 0.14.4 and ignores calls before rows render', async () => {
    const view = timeline() as unknown as {
      component: { scrollToDate: (date: string | Date) => void };
    };
    await screen.findByRole('button', { name: /^Draft brief, / });
    expect(typeof view.component.scrollToDate).toBe('function');
    expect(() => view.component.scrollToDate('2026-10-10')).not.toThrow();
    expect(() => view.component.scrollToDate('not-a-date')).not.toThrow();
    cleanup();
    const loading = render(TimelineView<Task>, {
      query: { current: undefined, loading: true, error: undefined },
      getTitle: (task: Task) => task.title,
    }) as unknown as { component: { scrollToDate: (date: string) => void } };
    expect(() => loading.component.scrollToDate('2026-10-10')).not.toThrow();
  });

  it('calls onOpen from a task bar and from the unscheduled tray', async () => {
    const onOpen = vi.fn();
    const undated = { id: 't4', title: 'Name the mascot', project: 'apollo' } as unknown as Task;
    timeline({ onOpen, query: query([...TASKS, undated]) });
    const bar = await screen.findByRole('button', { name: /^Draft brief, / });
    await fireEvent.click(bar);
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Name the mascot' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't4' }));
  });
});
