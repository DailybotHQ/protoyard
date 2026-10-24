import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dependency, ScheduleTask, TaskChange } from '@protoyard/views/timeline';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateAtOffset,
  dateOffset,
  durationLabel,
  TimelineView,
  timelineRange,
} from '../src/timeline/index.ts';

afterEach(() => cleanup());

interface Task extends ScheduleTask {
  title: string;
  progress: number;
}

const TASKS: Task[] = [
  { id: 'design', title: 'Design', start: '2026-10-19', end: '2026-10-20', progress: 50 },
  { id: 'build', title: 'Build', start: '2026-10-21', end: '2026-10-23', progress: 20 },
  {
    id: 'launch',
    title: 'Launch',
    start: '2026-10-26',
    end: '2026-10-26',
    progress: 0,
    milestone: true,
  },
];
const DEPENDENCIES: Dependency[] = [
  { from: 'design', to: 'build', type: 'FS' },
  { from: 'build', to: 'launch', type: 'FS' },
];
const query = (current: Task[] | undefined = TASKS) => ({ current, loading: false, error: null });
const NOW = new Date('2026-10-20T14:00:00.000Z');

function setup(props: Record<string, unknown> = {}) {
  return render(TimelineView<Task>, {
    query: query(),
    dependencies: DEPENDENCIES,
    now: NOW,
    ...props,
  } as never);
}

describe('durationLabel', () => {
  it('counts a same-day task as one day (end is inclusive); only a milestone takes none', () => {
    expect(durationLabel({ id: 'a', start: '2026-10-06', end: '2026-10-06' })).toBe('1 day');
    expect(
      durationLabel({ id: 'b', start: '2026-10-06', end: '2026-10-06', milestone: true })
    ).toBe('Milestone');
    expect(durationLabel({ id: 'c', start: '2026-10-05', end: '2026-10-09' })).toBe('5 days');
  });
});

describe('TimelineView', () => {
  it('calculates a padded range and converts civil dates to offsets', () => {
    expect(timelineRange(TASKS)).toEqual({ start: '2026-10-12', end: '2026-11-09' });
    expect(dateOffset('2026-10-20', '2026-10-19')).toBe(1);
    expect(dateAtOffset('2026-10-19', 2)).toBe('2026-10-21');
  });

  it('switches day, week, month and quarter zoom', async () => {
    setup();
    expect(document.querySelector('[data-timeline]')?.getAttribute('data-zoom')).toBe('week');
    await fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(document.querySelector('[data-timeline]')?.getAttribute('data-zoom')).toBe('month');
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    expect(document.querySelector('[data-timeline]')?.getAttribute('data-zoom')).toBe('quarter');
  });

  it('shows progress, dependency arrows, critical path and the runtime-clock today line', () => {
    setup();
    expect(screen.getByRole('treegrid', { name: 'Project timeline tasks' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(TASKS.length + 1);
    expect(
      screen.getByRole('button', { name: /Design, October 19, 2026 to October 20, 2026/ })
    ).toBeTruthy();
    expect(document.querySelector('.progress')?.getAttribute('style')).toContain('50%');
    expect(document.querySelectorAll('.dependencies path[marker-end]')).toHaveLength(2);
    expect(document.querySelector('[data-today-line]')?.getAttribute('aria-label')).toContain(
      'October 20'
    );
    expect(document.querySelectorAll('.task-bar.critical')).toHaveLength(3);
  });

  it('shows undated work in a keyboard-operable tray and focuses milestones', async () => {
    const onOpen = vi.fn();
    const current = [...TASKS, { id: 'backlog', title: 'Backlog item', progress: 0 }];
    setup({ query: query(current as Task[]), onOpen });
    const trayItem = screen.getByRole('button', { name: 'Backlog item' });
    expect(trayItem.closest('[aria-label="Unscheduled tasks"]')).toBeTruthy();
    await fireEvent.click(trayItem);
    expect(onOpen).toHaveBeenCalledWith(current[3]);

    await fireEvent.click(screen.getByRole('button', { name: 'Milestones only' }));
    expect(
      screen.getByRole('button', { name: /Launch, October 26, 2026.*milestone/ })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Design, October 19/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show all tasks' })).toBeTruthy();
  });

  it('orders rows by stable groups and announces row truncation', () => {
    setup({
      getGroup: (task: Task) => ({
        id: task.id === 'launch' ? 'milestones' : 'work',
        label: task.id === 'launch' ? 'Milestones' : 'Work',
      }),
      maxRows: 2,
    });
    expect(screen.getByRole('status').textContent).toContain('Showing 2 of 3 scheduled tasks');
    expect(screen.getAllByText('Work')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Launch, October 26/ })).toBeNull();
  });

  it('previews a dependency cascade and commits it from the keyboard', async () => {
    const onReschedule = vi.fn(async (_changes: readonly TaskChange[]) => {});
    setup({ onReschedule });
    const design = screen.getByRole('button', { name: /Design, October 19/ });
    await fireEvent.keyDown(design, { key: ' ' });
    await fireEvent.keyDown(design, { key: 'ArrowRight' });

    expect(screen.getByText(/Design preview: 2026-10-20 to 2026-10-21/)).toBeTruthy();
    const build = screen.getByRole('button', {
      name: /Build, October 22, 2026 to October 26, 2026/,
    });
    expect(build.classList.contains('preview')).toBe(true);

    await fireEvent.keyDown(design, { key: 'Enter' });
    await waitFor(() => expect(onReschedule).toHaveBeenCalledTimes(1));
    expect(onReschedule.mock.calls[0]?.[0]).toEqual([
      { id: 'design', start: '2026-10-20', end: '2026-10-21' },
      { id: 'build', start: '2026-10-22', end: '2026-10-26' },
      { id: 'launch', start: '2026-10-27', end: '2026-10-27' },
    ]);
  });

  it('cancels a keyboard preview and rolls an optimistic save back on failure', async () => {
    const onReschedule = vi.fn(async () => {
      throw new Error('offline');
    });
    setup({ onReschedule });
    const design = screen.getByRole('button', { name: /Design, October 19/ });
    await fireEvent.keyDown(design, { key: ' ' });
    await fireEvent.keyDown(design, { key: 'ArrowRight' });
    await fireEvent.keyDown(design, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Design, October 19/ })).toBeTruthy();
    expect(onReschedule).not.toHaveBeenCalled();

    await fireEvent.keyDown(screen.getByRole('button', { name: /Design, October 19/ }), {
      key: ' ',
    });
    await fireEvent.keyDown(screen.getByRole('button', { name: /Design, October 19/ }), {
      key: 'ArrowRight',
    });
    await fireEvent.keyDown(screen.getByRole('button', { name: /Design, October 20/ }), {
      key: 'Enter',
    });
    await waitFor(() => expect(screen.getByText(/dates were restored/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Design, October 19/ })).toBeTruthy();
  });
});

describe('TimelineView theming', () => {
  it('styles itself with theme tokens only, so dark mode and custom themes apply', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../src/timeline/TimelineView.svelte'),
      'utf8'
    );
    const style = source.slice(source.indexOf('<style'));
    expect(style.match(/#[0-9a-f]{3,8}\b|\b(?:white|black)\b(?!-)|rgba?\(/gi) ?? []).toEqual([]);
    expect(style).toContain('var(--py-primary-foreground)');
  });
});
