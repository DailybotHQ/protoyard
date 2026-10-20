import type { BoardMove } from '@protoyard/views/board';
import { rankSequence } from '@protoyard/views/board';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BoardView, indexFromPointer, placementsOf } from '../src/board/index.ts';
import { lazyMenu } from '../src/lib/lazy-overlays.svelte.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Task {
  id: string;
  title: string;
  status: string;
  team: string;
  rank: string;
}

const [r1, r2] = rankSequence(2) as [string, string];
const TASKS: Task[] = [
  { id: 't1', title: 'Login form', status: 'todo', team: 'web', rank: r1 },
  { id: 't2', title: 'Pricing page', status: 'todo', team: 'web', rank: r2 },
  { id: 't3', title: 'Audit log', status: 'doing', team: 'web', rank: r1 },
  { id: 't4', title: 'Offline mode', status: 'doing', team: 'mobile', rank: r1 },
];
const COLUMNS = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing', wip: { hard: 3 } },
  { id: 'done', title: 'Done' },
];

const card = createRawSnippet((task: () => Task) => ({
  render: () => `<span>${task().title}</span>`,
}));
const query = (
  current: Task[] | undefined,
  extra: { loading?: boolean; error?: unknown } = {}
) => ({
  current,
  loading: extra.loading ?? false,
  error: extra.error,
});

function board(props: Record<string, unknown> = {}) {
  const onMove = vi.fn<(move: BoardMove, task: Task) => unknown>(async () => {});
  const onOpen = vi.fn();
  render(BoardView<Task>, {
    query: query(TASKS),
    columns: COLUMNS,
    getId: (t: Task) => t.id,
    getColumn: (t: Task) => t.status,
    getRank: (t: Task) => t.rank,
    getLabel: (t: Task) => t.title,
    card,
    onMove,
    onOpen,
    ...props,
  });
  return { onMove: (props.onMove as typeof onMove | undefined) ?? onMove, onOpen };
}

const list = (name: string) => screen.getByRole('list', { name });
const control = (title: string) =>
  screen.getByText(title).closest('[data-card-control]') as HTMLElement;
const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

// Menus, dialogs and some panels load on first use; load them once up front so
// the first test that opens one never races a cold import on a busy machine.
beforeAll(async () => {
  await lazyMenu.load();
}, 30_000);

describe('BoardView', () => {
  it('renders each column as a labelled list with a WIP badge', () => {
    board();
    expect(within(list('To do')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list('Doing')).getByText('Audit log')).toBeTruthy();
    expect(within(list('Done')).getByText('No cards')).toBeTruthy();
    const badge = document
      .querySelector('[data-column-header="doing"]')
      ?.textContent?.replace(/\s+/g, ' ');
    expect(badge).toContain('2 / 3');
    expect(control('Login form').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('moves a card with the keyboard, optimistically and with pending feedback', async () => {
    let finish: () => void = () => {};
    const onMove = vi.fn((_move: BoardMove) => new Promise<void>((resolve) => (finish = resolve)));
    board({ onMove });
    const login = control('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    expect(live()).toContain('Picked up Login form');
    await fireEvent.keyDown(control('Login form'), { key: 'ArrowRight' });
    expect(live()).toContain('Doing, position 1 of 3');
    // The held card previews in its target column.
    expect(within(list('Doing')).getByText('Login form')).toBeTruthy();
    await fireEvent.keyDown(control('Login form'), { key: ' ' });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ itemId: 't1', columnId: 'doing', index: 0 });
    await waitFor(() => expect(control('Login form').getAttribute('aria-busy')).toBe('true'));
    expect(within(list('Doing')).getByText('Login form')).toBeTruthy();
    expect(within(list('Doing')).getByText('Saving')).toBeTruthy();
    finish();
    await waitFor(() => expect(control('Login form').hasAttribute('aria-busy')).toBe(false));
    expect(within(list('Doing')).getByText('Login form')).toBeTruthy();
  });

  it('blocks a drop into a full column and says why', async () => {
    const full = [...TASKS, { id: 't5', title: 'Search', status: 'doing', team: 'web', rank: r2 }];
    const { onMove } = board({ query: query(full) });
    const login = control('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    await fireEvent.keyDown(control('Login form'), { key: 'ArrowRight' });
    expect(live()).toContain('Dropping here is not allowed');
    await fireEvent.keyDown(control('Login form'), { key: 'Enter' });
    expect(onMove).not.toHaveBeenCalled();
    expect(live()).toContain('Doing has reached its WIP limit (3 of 3)');
    await fireEvent.keyDown(control('Login form'), { key: 'Escape' });
    expect(within(list('To do')).getByText('Login form')).toBeTruthy();
  });

  it('rolls the card back when the move fails', async () => {
    const onMove = vi.fn(async () => {
      throw new Error('Simulated network failure');
    });
    board({ onMove });
    const login = control('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    await fireEvent.keyDown(control('Login form'), { key: 'ArrowRight' });
    await fireEvent.keyDown(control('Login form'), { key: ' ' });
    await waitFor(() => expect(live()).toContain('Login form was not moved'));
    expect(within(list('To do')).getByText('Login form')).toBeTruthy();
    expect(within(list('Doing')).queryByText('Login form')).toBeNull();
  });

  it('drags with the mouse past the threshold, and a plain click opens the card', async () => {
    const { onMove, onOpen } = board();
    const target = list('Done');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    const login = control('Login form');
    await fireEvent.pointerDown(login, {
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    });
    await fireEvent.pointerMove(window, { pointerId: 1, clientX: 12, clientY: 11 }); // under the threshold
    expect(document.querySelector('[data-board-placeholder]')).toBeNull();
    await fireEvent.pointerMove(window, { pointerId: 1, clientX: 300, clientY: 40 });
    expect(target.querySelector('[data-board-placeholder]')).not.toBeNull();
    // The browser sends the gesture's click right after pointerup, in the same task.
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 300, clientY: 40 });
    fireEvent.click(login);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ itemId: 't1', columnId: 'done' });
    expect(onOpen).not.toHaveBeenCalled(); // the click after a drag is not an open
    await fireEvent.click(control('Pricing page'));
    expect(onOpen).toHaveBeenCalledWith(TASKS[1]);
  });

  it('only drags from the grip on touch, so swiping still scrolls', async () => {
    const { onMove } = board();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(list('Done'));
    const login = control('Login form');
    await fireEvent.pointerDown(login, {
      button: 0,
      pointerId: 2,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    });
    await fireEvent.pointerMove(window, { pointerId: 2, clientX: 300, clientY: 10 });
    await fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onMove).not.toHaveBeenCalled();
    const grip = login.querySelector('[data-drag-handle]') as HTMLElement;
    await fireEvent.pointerDown(grip, {
      button: 0,
      pointerId: 3,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    });
    await fireEvent.pointerMove(window, { pointerId: 3, clientX: 300, clientY: 10 });
    await fireEvent.pointerUp(window, { pointerId: 3 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('moves through the "Move to…" menu, with full columns disabled', async () => {
    const full = [...TASKS, { id: 't5', title: 'Search', status: 'doing', team: 'web', rank: r2 }];
    const { onMove } = board({ query: query(full) });
    const trigger = screen.getByRole('button', { name: 'Move Login form to…' });
    await fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    await fireEvent.click(trigger);
    const doing = await screen.findByRole('menuitem', { name: 'Doing' });
    expect(
      doing.getAttribute('aria-disabled') ?? doing.getAttribute('data-disabled')
    ).not.toBeNull();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ itemId: 't1', columnId: 'done' });
  });

  it('collapses swimlanes like an accordion', async () => {
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
    });
    expect(list('Doing, Mobile')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Mobile/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Doing, Mobile' })).toBeNull();
    expect(list('Doing, Web')).toBeTruthy();
  });

  it('shows the query states through QueryState', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const view = render(BoardView<Task>, {
      query: query(undefined, { loading: true }),
      columns: COLUMNS,
      getId: (t: Task) => t.id,
      getColumn: (t: Task) => t.status,
      getRank: (t: Task) => t.rank,
      getLabel: (t: Task) => t.title,
      card,
      onMove: vi.fn(),
      onRetry,
      label: 'Sprint board',
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.getByRole('status', { name: 'Loading sprint board' })).toBeTruthy();
    vi.useRealTimers();
    await view.rerender({
      query: query(undefined, { error: new Error('Disk full') }),
      columns: COLUMNS,
      getId: (t: Task) => t.id,
      getColumn: (t: Task) => t.status,
      getRank: (t: Task) => t.rank,
      getLabel: (t: Task) => t.title,
      card,
      onMove: vi.fn(),
      onRetry,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});

describe('board helpers', () => {
  it('computes drop indexes and the placements of a move', () => {
    expect(indexFromPointer([10, 50, 90], 5)).toBe(0);
    expect(indexFromPointer([10, 50, 90], 60)).toBe(2);
    expect(indexFromPointer([10, 50, 90], 200)).toBe(3);
    expect(
      placementsOf({
        itemId: 'a',
        fromColumnId: 'todo',
        fromLaneId: '',
        columnId: 'done',
        laneId: '',
        index: 0,
        rank: 'a1',
        rerank: [
          { itemId: 'a', rank: 'a1' },
          { itemId: 'b', rank: 'a2' },
        ],
      })
    ).toEqual({
      a: { columnId: 'done', laneId: '', rank: 'a1' },
      b: { columnId: 'done', laneId: '', rank: 'a2' },
    });
  });
});
