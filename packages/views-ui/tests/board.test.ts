import type { BoardMove } from '@protoyard/views/board';
import { rankSequence } from '@protoyard/views/board';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardView, indexFromPointer, placementsOf } from '../src/board/index.ts';

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
const handle = (title: string) => screen.getByRole('button', { name: `Move ${title}` });
const live = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

describe('BoardView (Texuli Board host adapter)', () => {
  it('renders each column as a labelled list with a WIP count', () => {
    board();
    expect(within(list('To do')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    expect(within(list('Doing')).getByText('Audit log')).toBeTruthy();
    expect(within(list('Done')).getByText('No cards')).toBeTruthy();
    // Texuli board puts hard WIP on the column count label (e.g. "2/3").
    expect(document.body.textContent?.replace(/\s+/g, ' ')).toMatch(/2\s*\/\s*3/);
    expect(handle('Login form').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('moves a card with the keyboard and calls onMove', async () => {
    const onMove = vi.fn(async () => {});
    board({ onMove });
    const login = handle('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    expect(live().toLowerCase()).toMatch(/pick|held|move/i);
    await fireEvent.keyDown(handle('Login form'), { key: 'ArrowRight' });
    await fireEvent.keyDown(handle('Login form'), { key: ' ' });
    await waitFor(() => expect(onMove).toHaveBeenCalled());
    const move = onMove.mock.calls.at(0)?.at(0) as BoardMove | undefined;
    expect(move?.itemId).toBe('t1');
  });

  it('blocks a drop into a full hard-WIP column', async () => {
    // Three cards already fill hard WIP 3 on doing; another move must not commit.
    const packed = [
      { id: 't1', title: 'Login form', status: 'todo', team: 'web', rank: r1 },
      { id: 'a', title: 'A', status: 'doing', team: 'web', rank: r1 },
      { id: 'b', title: 'B', status: 'doing', team: 'web', rank: r2 },
      { id: 'c', title: 'C', status: 'doing', team: 'web', rank: r2 },
    ];
    const onMove = vi.fn(async () => {});
    board({ query: query(packed), onMove });
    const login = handle('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    await fireEvent.keyDown(handle('Login form'), { key: 'ArrowRight' });
    await fireEvent.keyDown(handle('Login form'), { key: ' ' });
    // Hard WIP rejects; onMove must not fire for the blocked drop.
    await new Promise((r) => setTimeout(r, 50));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('invokes onMove and surfaces a failed save without leaving a pending card', async () => {
    const onMove = vi.fn(async () => {
      throw new Error('offline');
    });
    board({ onMove });
    const login = handle('Login form');
    login.focus();
    await fireEvent.keyDown(login, { key: ' ' });
    await fireEvent.keyDown(handle('Login form'), { key: 'ArrowRight' });
    await fireEvent.keyDown(handle('Login form'), { key: ' ' });
    await waitFor(() => expect(onMove).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.tx-board__pending')).toBeNull());
  });

  it('opens a card from the host open control', async () => {
    const { onOpen } = board();
    const open = screen.getByText('Login form').closest('button.py-board-open') as HTMLElement;
    expect(open).toBeTruthy();
    await fireEvent.click(open);
    expect(onOpen).toHaveBeenCalled();
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

  it('renders swimlane lists when lanes are set', () => {
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
    });
    expect(list('Doing, Web')).toBeTruthy();
    expect(list('Doing, Mobile')).toBeTruthy();
  });
});

describe('board helpers', () => {
  it('computes drop indexes and the placements of a move', () => {
    expect(indexFromPointer([10, 30, 50], 25)).toBe(1);
    expect(
      placementsOf({
        itemId: 't1',
        fromColumnId: 'todo',
        fromLaneId: '',
        columnId: 'done',
        laneId: '',
        index: 0,
        rank: 'a0',
        rerank: [{ itemId: 't2', rank: 'a1' }],
      })
    ).toEqual({
      t1: { columnId: 'done', laneId: '', rank: 'a0' },
      t2: { columnId: 'done', laneId: '', rank: 'a1' },
    });
  });
});
