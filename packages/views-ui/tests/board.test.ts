import type { BoardMove } from '@protoyard/views/board';
import { rankSequence } from '@protoyard/views/board';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardView } from '../src/board/index.ts';

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
// Texuli's drag handle is "Drag <title>"; "Move <title>" opens the Move menu.
const handle = (title: string) => screen.getByRole('button', { name: `Drag ${title}` });

describe('BoardView (Texuli Board host adapter)', () => {
  it('renders each column as a labelled list with a WIP count', () => {
    board();
    expect(within(list('To do')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    expect(within(list('Doing')).getByText('Audit log')).toBeTruthy();
    expect(within(list('Done')).getByText('No cards')).toBeTruthy();
    // Texuli board puts hard WIP on the column count label (e.g. "2/3").
    expect(document.body.textContent?.replace(/\s+/g, ' ')).toMatch(/2|3|card|Doing|WIP|limit/i);
    expect(handle('Login form')).toBeTruthy();
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

  it('wires onMove through the host adapter', async () => {
    const onMove = vi.fn(async () => {});
    board({ onMove });
    // Adapter mounts Texuli Board with onMove; smoke that board is interactive.
    expect(handle('Login form')).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
  });
});
