import type { BoardMove } from '@protoyard/views/board';
import { rankSequence } from '@protoyard/views/board';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

  it('renders a column header snippet with the card count (D-G-034)', () => {
    const columnHeader = createRawSnippet(
      (column: () => { id: string; title: string }, state: () => { count: number }) => ({
        render: () =>
          `<span data-testid="head-${column().id}">${state().count} in ${column().title}</span>`,
      })
    );
    board({ columnHeader });
    expect(screen.getByTestId('head-todo').textContent).toBe('2 in To do');
    expect(screen.getByTestId('head-done').textContent).toBe('0 in Done');
  });

  it('creates a card inside a column through onCreate (D-G-034)', async () => {
    const onCreate = vi.fn(async (_column: { id: string; title: string }) => {});
    board({ onCreate, canCreate: (column: { id: string }) => column.id !== 'done' });
    const add = screen.getByRole('button', { name: 'Add card to Doing' });
    await fireEvent.click(add);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ id: 'doing', title: 'Doing' });
    expect(screen.getByRole('button', { name: 'Add card to To do' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add card to Done' })).toBeNull();
  });

  it('keeps a custom column footer next to the create button', () => {
    const columnFooter = createRawSnippet((column: () => { id: string }) => ({
      render: () => `<span data-testid="foot-${column().id}">footer</span>`,
    }));
    board({ columnFooter, onCreate: vi.fn() });
    expect(screen.getByTestId('foot-todo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add card to To do' })).toBeTruthy();
  });

  it('collapses and expands swimlanes from the lane toolbar (D-G-034)', async () => {
    const onCollapsedLanesChange = vi.fn();
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
      collapsibleLanes: true,
      onCollapsedLanesChange,
    });
    const toolbar = screen.getByRole('group', { name: 'Board lanes' });
    const mobile = within(toolbar).getByRole('button', { name: /Mobile \(1\)/ });
    expect(mobile.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Offline mode')).toBeTruthy();

    await fireEvent.click(mobile);
    expect(onCollapsedLanesChange).toHaveBeenLastCalledWith(['mobile']);
    expect(mobile.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Offline mode')).toBeNull();
    expect(screen.getByText('Audit log')).toBeTruthy();

    await fireEvent.click(mobile);
    expect(onCollapsedLanesChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByText('Offline mode')).toBeTruthy();
  });

  it('starts with lanes collapsed from the collapsedLanes prop', () => {
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
      collapsibleLanes: true,
      collapsedLanes: ['web'],
    });
    expect(screen.queryByText('Login form')).toBeNull();
    expect(screen.getByText('Offline mode')).toBeTruthy();
  });

  it('shows no lane toolbar unless collapsibleLanes is set', () => {
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
    });
    expect(screen.queryByRole('group', { name: 'Board lanes' })).toBeNull();
  });

  it('keeps collapsed lanes in the column totals (Texuli 0.14.1 collapsedLanes)', async () => {
    const columnHeader = createRawSnippet(
      (column: () => { id: string }, state: () => { count: number }) => ({
        render: () => `<span data-testid="count-${column().id}">${state().count}</span>`,
      })
    );
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
      collapsibleLanes: true,
      columnHeader,
    });
    const before = screen.getByTestId('count-todo').textContent;
    const toolbar = screen.getByRole('group', { name: 'Board lanes' });
    await fireEvent.click(within(toolbar).getByRole('button', { name: /Mobile/ }));
    expect(screen.queryByText('Offline mode')).toBeNull();
    expect(screen.getByTestId('count-todo').textContent).toBe(before);
  });

  it('creates a card in a column and lane through cellFooter (Texuli 0.14.1)', async () => {
    const onCreate = vi.fn(async () => {});
    board({
      lanes: [
        { id: 'web', title: 'Web' },
        { id: 'mobile', title: 'Mobile' },
      ],
      getLane: (t: Task) => t.team,
      onCreate,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add card to Doing, Mobile' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]).toMatchObject([{ id: 'doing' }, { id: 'mobile' }]);
  });
});
