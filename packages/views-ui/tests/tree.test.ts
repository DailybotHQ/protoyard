import { rankSequence } from '@protoyard/views/board';
import type { TreeMove } from '@protoyard/views/tree';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropZone, OutlineEditor, TreeView } from '../src/tree/index.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Node {
  id: string;
  parentId: string | null;
  rank: string;
  title: string;
}

const [a, b] = rankSequence(2) as [string, string];
const NODES: Node[] = [
  { id: 'docs', parentId: null, rank: a, title: 'Docs' },
  { id: 'changelog', parentId: null, rank: b, title: 'Changelog' },
  { id: 'intro', parentId: 'docs', rank: a, title: 'Intro' },
  { id: 'guides', parentId: 'docs', rank: b, title: 'Guides' },
  { id: 'setup', parentId: 'guides', rank: a, title: 'Setup' },
];
const query = (current: Node[] | undefined) => ({ current, loading: false, error: undefined });
const accessors = {
  getId: (n: Node) => n.id,
  getParentId: (n: Node) => n.parentId,
  getRank: (n: Node) => n.rank,
};

function tree(props: Record<string, unknown> = {}) {
  const onMove = vi.fn(async (_move: TreeMove) => {});
  render(TreeView<Node>, {
    query: query(NODES),
    ...accessors,
    getLabel: (n: Node) => n.title,
    onMove,
    label: 'Pages',
    expanded: ['docs'],
    ...props,
  });
  return { onMove: (props.onMove as typeof onMove | undefined) ?? onMove };
}
const item = (name: string) => screen.getByRole('treeitem', { name: new RegExp(`^${name}`) });
const live = () =>
  [...document.querySelectorAll('[aria-live="polite"]')].map((n) => n.textContent).join(' ');

describe('TreeView', () => {
  it('renders an ARIA tree of the open nodes', () => {
    tree();
    expect(screen.getByRole('tree', { name: 'Pages' })).toBeTruthy();
    expect(
      screen.getAllByRole('treeitem').map((n) => n.textContent?.trim().split(/\s/)[0])
    ).toEqual(['Docs', 'Intro', 'Guides', 'Changelog']);
    expect(item('Guides').getAttribute('aria-level')).toBe('2');
    expect(item('Guides').getAttribute('aria-posinset')).toBe('2');
    expect(item('Guides').getAttribute('aria-setsize')).toBe('2');
    expect(item('Guides').getAttribute('aria-expanded')).toBe('false');
    expect(item('Intro').hasAttribute('aria-expanded')).toBe(false);
    expect(item('Docs').tabIndex).toBe(0);
    expect(item('Intro').tabIndex).toBe(-1);
  });

  it('moves focus and opens nodes with the keyboard, with typeahead and *', async () => {
    tree({ expanded: [] });
    item('Docs').focus();
    await fireEvent.keyDown(item('Docs'), { key: 'ArrowRight' });
    await waitFor(() => expect(item('Docs').getAttribute('aria-expanded')).toBe('true'));
    await fireEvent.keyDown(item('Docs'), { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(item('Intro')));
    await fireEvent.keyDown(item('Intro'), { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement).toBe(item('Docs')));
    await fireEvent.keyDown(item('Docs'), { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(item('Changelog')));
    await fireEvent.keyDown(item('Changelog'), { key: 'g' });
    await waitFor(() => expect(document.activeElement).toBe(item('Guides')));
    await fireEvent.keyDown(item('Guides'), { key: '*' });
    await waitFor(() => expect(item('Guides').getAttribute('aria-expanded')).toBe('true'));
    expect(item('Setup')).toBeTruthy();
    await fireEvent.keyDown(item('Setup'), { key: 'Enter' });
    expect(item('Setup').getAttribute('aria-selected')).toBe('true');
  });

  it('loads lazy children once, showing busy while loading', async () => {
    let finish: () => void = () => {};
    const loadChildren = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    tree({ hasChildren: (n: Node) => n.id === 'changelog', loadChildren });
    const changelog = item('Changelog');
    expect(changelog.getAttribute('aria-expanded')).toBe('false');
    changelog.focus();
    await fireEvent.keyDown(changelog, { key: 'ArrowRight' });
    await waitFor(() => expect(item('Changelog').getAttribute('aria-busy')).toBe('true'));
    finish();
    await waitFor(() => expect(item('Changelog').hasAttribute('aria-busy')).toBe(false));
    await fireEvent.keyDown(item('Changelog'), { key: 'ArrowLeft' });
    await fireEvent.keyDown(item('Changelog'), { key: 'ArrowRight' });
    expect(loadChildren).toHaveBeenCalledTimes(1);
  });

  it('moves with Shift+F10 "Move to…", optimistically, never into its own subtree', async () => {
    let finish: () => void = () => {};
    const onMove = vi.fn((_move: TreeMove) => new Promise<void>((resolve) => (finish = resolve)));
    tree({ onMove, expanded: ['docs', 'guides'] });
    item('Docs').focus();
    await fireEvent.keyDown(item('Docs'), { key: 'F10', shiftKey: true });
    const own = await screen.findAllByRole('menuitem');
    expect(own.map((m) => m.textContent?.trim())).toEqual(['Top level', 'Changelog']);
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();

    tree({ onMove, expanded: ['docs'] });
    item('Intro').focus();
    await fireEvent.keyDown(item('Intro'), { key: 'F10', shiftKey: true });
    await fireEvent.click(await screen.findByRole('menuitem', { name: /Changelog/ }));
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ id: 'intro', parentId: 'changelog' });
    // Optimistic: under Changelog (opened so it stays visible), busy until saved.
    await waitFor(() => expect(item('Intro').getAttribute('aria-level')).toBe('2'));
    expect(item('Intro').getAttribute('aria-busy')).toBe('true');
    expect(item('Changelog').getAttribute('aria-expanded')).toBe('true');
    finish();
    await waitFor(() => expect(item('Intro').hasAttribute('aria-busy')).toBe(false));
  });

  it('rolls a failed move back', async () => {
    const onMove = vi.fn(async (_move: TreeMove) => {
      throw new Error('Simulated network failure');
    });
    tree({ onMove });
    item('Intro').focus();
    await fireEvent.keyDown(item('Intro'), { key: 'F10', shiftKey: true });
    await fireEvent.click(await screen.findByRole('menuitem', { name: /Changelog/ }));
    await waitFor(() => expect(live()).toContain('Intro was not moved'));
    const docsChildren = screen
      .getAllByRole('treeitem')
      .map((n) => n.textContent?.trim().split(/\s/)[0]);
    expect(docsChildren.slice(0, 2)).toEqual(['Docs', 'Intro']);
  });

  it('reparents by dragging, and refuses a drop into its own subtree', async () => {
    const { onMove } = tree({ expanded: ['docs', 'guides'] });
    const drop = async (moving: string, over: string, y: number) => {
      const target = item(over);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        height: 32,
        left: 0,
        width: 200,
        bottom: 32,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
      await fireEvent.pointerDown(item(moving), {
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 0,
        clientY: 0,
      });
      await fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: y });
      await fireEvent.pointerUp(window, { pointerId: 1, clientX: 20, clientY: y });
    };
    await drop('Intro', 'Changelog', 16); // the middle: inside
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ id: 'intro', parentId: 'changelog' });
    await drop('Docs', 'Setup', 16);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(live()).toContain('A node cannot move inside itself.');
    expect(dropZone(0, 32, 4)).toBe('before');
    expect(dropZone(0, 32, 30)).toBe('after');
  });

  it('virtualizes big trees, rendering a window of rows', () => {
    const many: Node[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `n${i}`,
      parentId: null,
      rank: `a${String(i).padStart(4, '1')}`,
      title: `Page ${i}`,
    }));
    render(TreeView<Node>, {
      query: query(many),
      ...accessors,
      getLabel: (n: Node) => n.title,
      label: 'Pages',
    });
    const rendered = screen.getAllByRole('treeitem');
    expect(rendered.length).toBeLessThan(100);
    expect(rendered[0]?.getAttribute('aria-setsize')).toBe('1000');
  });
});

describe('OutlineEditor', () => {
  const titles = () => (screen.getAllByRole('textbox') as HTMLInputElement[]).map((i) => i.value);
  const input = (title: string) =>
    screen.getByRole('textbox', { name: new RegExp(`^${title},`) }) as HTMLInputElement;

  function outline(props: Record<string, unknown> = {}) {
    const handlers = {
      onCreate: vi.fn(async () => 'new'),
      onRename: vi.fn(async () => {}),
      onMove: vi.fn(async (_move: TreeMove) => {}),
      onDelete: vi.fn(async () => {}),
      ...props,
    };
    const view = render(OutlineEditor<Node>, {
      query: query(NODES),
      ...accessors,
      getTitle: (n: Node) => n.title,
      label: 'Plan',
      ...handlers,
    });
    return { ...handlers, view };
  }

  it('lists every item with its level', () => {
    outline();
    expect(titles()).toEqual(['Docs', 'Intro', 'Guides', 'Setup', 'Changelog']);
    expect(input('Setup').getAttribute('aria-label')).toBe('Setup, level 3');
  });

  it('adds a sibling on Enter and focuses it when it arrives', async () => {
    const { onCreate, view } = outline();
    input('Intro').focus();
    await fireEvent.keyDown(input('Intro'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const place = (
      onCreate.mock.calls[0] as unknown as [{ parentId: string; rank: string; title: string }]
    )[0];
    expect(place.parentId).toBe('docs');
    expect(place.rank > a && place.rank < b).toBe(true);
    await view.rerender({
      query: query([...NODES, { id: 'new', parentId: 'docs', rank: place.rank, title: '' }]),
    });
    await waitFor(() => expect(document.activeElement?.id).toMatch(/-new$/));
  });

  it('indents, outdents and moves with Tab, Shift+Tab and Alt+arrows', async () => {
    const { onMove } = outline();
    await fireEvent.keyDown(input('Guides'), { key: 'Tab' });
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ id: 'guides', parentId: 'intro' });
    cleanup();
    const second = outline();
    await fireEvent.keyDown(input('Setup'), { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(second.onMove).toHaveBeenCalledTimes(1));
    expect(second.onMove.mock.calls[0]?.[0]).toMatchObject({ id: 'setup', parentId: 'docs' });
    await fireEvent.keyDown(input('Docs'), { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(second.onMove).toHaveBeenCalledTimes(2));
    const moved = second.onMove.mock.calls[1]?.[0];
    expect(moved && moved.rank > b).toBe(true);
    // At an edge it says so instead of moving.
    await fireEvent.keyDown(input('Intro'), { key: 'Tab' });
    expect(live()).toContain('There is no item above to indent under.');
  });

  it('renames on blur and puts the saved title back when renaming fails', async () => {
    const onRename = vi.fn(async () => {
      throw new Error('Simulated network failure');
    });
    outline({ onRename });
    const field = input('Intro');
    await fireEvent.input(field, { target: { value: 'Introduction' } });
    await fireEvent.blur(field);
    await waitFor(() => expect(onRename).toHaveBeenCalledWith(NODES[2], 'Introduction'));
    await waitFor(() => expect(titles()).toContain('Intro'));
    expect(live()).toContain('The title was not saved.');
  });

  it('deletes an empty item with Backspace', async () => {
    const { onDelete } = outline({
      query: query([...NODES, { id: 'blank', parentId: null, rank: 'b', title: '' }]),
    });
    const blank = screen.getByRole('textbox', { name: /^Untitled, level 1/ });
    await fireEvent.keyDown(blank, { key: 'Backspace' });
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
