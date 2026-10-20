import type { FilterNode, GridValue, SavedView } from '@protoyard/views/grid';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  completeFilter,
  DataGrid,
  type DataGridColumn,
  emptyView,
  FilterBuilder,
  type GridViewState,
  nextSort,
  parseEditorValue,
} from '../src/grid/index.ts';
import { lazyDialog, lazyMenu } from '../src/lib/lazy-overlays.svelte.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Deal {
  id: string;
  name: string;
  stage: 'lead' | 'won' | 'lost';
  amount: number;
  closes: string;
  active: boolean;
}

const STAGES = ['lead', 'won', 'lost'] as const;
const deals = (count: number): Deal[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `d${i}`,
    name: `Deal ${String(i).padStart(4, '0')}`,
    stage: STAGES[i % 3] as Deal['stage'],
    amount: (i % 7) * 1000 + i,
    closes: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
    active: i % 2 === 0,
  }));
const COLUMNS: DataGridColumn<Deal>[] = [
  { key: 'name', header: 'Name', type: 'text', editable: true, width: 200 },
  { key: 'stage', header: 'Stage', type: 'enum', options: [...STAGES], editable: true },
  { key: 'amount', header: 'Amount', type: 'number', editable: true },
  { key: 'closes', header: 'Closes', type: 'date' },
  { key: 'active', header: 'Active', type: 'boolean' },
];
const query = (current: Deal[] | undefined) => ({ current, loading: false, error: undefined });

function grid(props: Record<string, unknown> = {}, rows = deals(20)) {
  let view: GridViewState = (props.view as GridViewState | undefined) ?? emptyView();
  const onCommit = vi.fn(async (_row: Deal, _key: string, _value: GridValue) => {});
  render(DataGrid<Deal>, {
    query: query(rows),
    columns: COLUMNS,
    getRowId: (d: Deal) => d.id,
    label: 'Deals',
    onCommit,
    onViewChange: (next: GridViewState) => {
      view = next;
    },
    ...props,
  });
  return {
    onCommit: (props.onCommit as typeof onCommit | undefined) ?? onCommit,
    view: () => view,
  };
}
const table = () => screen.getByRole('grid', { name: 'Deals' });
const cell = (r: number, c: number) =>
  table().querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`) as HTMLElement;
const headers = () =>
  within(table())
    .getAllByRole('columnheader')
    .map((h) => h.querySelector('button span')?.textContent);
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement as Element, { key, ...init });

// Menus, dialogs and some panels load on first use; load them once up front so
// the first test that opens one never races a cold import on a busy machine.
beforeAll(async () => {
  await Promise.all([
    lazyMenu.load(),
    lazyDialog.load(),
    import('../src/grid/FilterBuilder.svelte'),
  ]);
}, 30_000);

describe('DataGrid', () => {
  it('renders an ARIA grid with only the windowed rows', () => {
    grid({}, deals(1000));
    const g = table();
    expect(g.getAttribute('aria-rowcount')).toBe('1001');
    expect(g.getAttribute('aria-colcount')).toBe('5');
    expect(headers()).toEqual(['Name', 'Stage', 'Amount', 'Closes', 'Active']);
    const rendered = within(g).getAllByRole('row').length - 1;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThanOrEqual(60);
    expect(cell(0, 0).textContent).toContain('Deal 0000');
    expect(cell(0, 4).textContent).toContain('Yes');
    // One tab stop: the active cell.
    expect(g.querySelectorAll('[role="gridcell"][tabindex="0"]').length).toBe(1);
    expect(screen.getByText('1,000 rows')).toBeTruthy();
  });

  it('moves focus with arrows, Home/End, Ctrl+Home/End and PageUp/Down', async () => {
    grid();
    cell(0, 0).focus();
    await press('ArrowRight');
    await waitFor(() => expect(document.activeElement).toBe(cell(0, 1)));
    await press('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 1)));
    expect(cell(1, 1).getAttribute('tabindex')).toBe('0');
    expect(cell(0, 0).getAttribute('tabindex')).toBe('-1');
    await press('End');
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 4)));
    await press('ArrowRight'); // clamps at the edge
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 4)));
    await press('Home');
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 0)));
    await press('PageDown');
    await waitFor(() => expect(document.activeElement).toBe(cell(14, 0)));
    await press('PageUp');
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 0)));
    await press('End', { ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(cell(19, 4)));
    await press('Home', { ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(cell(0, 0)));
  });

  it('edits a cell with Enter, shows pending, and rolls back with the error on rejection', async () => {
    let reject: (error: unknown) => void = () => {};
    const onCommit = vi.fn(
      (_row: Deal, _key: string, _value: GridValue) =>
        new Promise<void>((_, fail) => {
          reject = fail;
        })
    );
    grid({ onCommit });
    cell(0, 0).focus();
    await press('Enter');
    const editor = await screen.findByRole('textbox', { name: 'Name' });
    expect((editor as HTMLInputElement).value).toBe('Deal 0000');
    await fireEvent.input(editor, { target: { value: 'Renamed' } });
    await fireEvent.keyDown(editor, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'd0' }), 'name', 'Renamed');
    // Optimistic value with a per-cell spinner while the promise is pending.
    await waitFor(() => expect(cell(0, 0).getAttribute('aria-busy')).toBe('true'));
    expect(cell(0, 0).textContent).toContain('Renamed');
    expect(within(cell(0, 0)).getByText('Saving')).toBeTruthy();
    reject(Object.assign(new Error('Invalid'), { issues: { name: 'That name is taken' } }));
    await waitFor(() => expect(cell(0, 0).textContent).toContain('Deal 0000'));
    expect(cell(0, 0).getAttribute('aria-busy')).toBeNull();
    expect(cell(0, 0).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('That name is taken');
  });

  it('cancels an edit with Escape, and opens one with F2 by column type', async () => {
    const { onCommit } = grid();
    cell(0, 2).focus();
    await press('F2');
    const amount = await screen.findByRole('spinbutton', { name: 'Amount' });
    await fireEvent.input(amount, { target: { value: '42' } });
    await fireEvent.keyDown(amount, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'Amount' })).toBeNull());
    expect(onCommit).not.toHaveBeenCalled();
    expect(cell(0, 2).textContent).toContain('0');
    // A number commits as a number; non-editable columns ignore Enter.
    await press('Enter');
    const again = await screen.findByRole('spinbutton', { name: 'Amount' });
    await fireEvent.input(again, { target: { value: '42' } });
    await fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(expect.anything(), 'amount', 42));
    cell(0, 3).focus();
    await fireEvent.click(cell(0, 3));
    await press('Enter');
    expect(table().querySelector('[data-editor]')).toBeNull();
  });

  it('edits an enum cell with a native select (no overlay layers inside a cell)', async () => {
    const { onCommit } = grid();
    cell(0, 1).focus();
    await press('Enter');
    const stage = await screen.findByRole('combobox', { name: 'Stage' });
    expect(stage.tagName).toBe('SELECT');
    await waitFor(() => expect(document.activeElement).toBe(stage));
    const next = [...(stage as HTMLSelectElement).options]
      .map((o) => o.value)
      .find((v) => v !== (stage as HTMLSelectElement).value) as string;
    await fireEvent.change(stage, { target: { value: next } });
    await fireEvent.keyDown(stage, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(expect.anything(), 'stage', next));
  });

  it('hides and pins columns through state and the column menu', async () => {
    const { view } = grid({
      view: {
        ...emptyView(),
        columns: [
          { key: 'name' },
          { key: 'stage', hidden: true },
          { key: 'amount', pinned: 'right' },
        ],
      },
    });
    expect(headers()).toEqual(['Name', 'Closes', 'Active', 'Amount']);
    const amount = within(table()).getAllByRole('columnheader')[3] as HTMLElement;
    expect(amount.className).toContain('sticky');
    expect(amount.style.right).toBe('0px');

    const trigger = screen.getByRole('button', { name: 'Closes column options' });
    await fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
    await fireEvent.click(trigger);
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin left' }));
    await waitFor(() => expect(headers()).toEqual(['Closes', 'Name', 'Active', 'Amount']));
    expect(view().columns.find((c) => c.key === 'closes')?.pinned).toBe('left');
    const closes = within(table()).getAllByRole('columnheader')[0] as HTMLElement;
    expect(closes.style.left).toBe('0px');

    const name = screen.getByRole('button', { name: 'Name column options' });
    await fireEvent.pointerDown(name, { button: 0, pointerType: 'mouse' });
    await fireEvent.click(name);
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide column' }));
    await waitFor(() => expect(headers()).toEqual(['Closes', 'Active', 'Amount']));
    expect(view().columns.find((c) => c.key === 'name')?.hidden).toBe(true);
  });

  it('resizes and reorders columns from the keyboard', async () => {
    const { view } = grid();
    const handle = screen.getByRole('separator', { name: 'Resize Name' });
    expect(handle.getAttribute('aria-valuenow')).toBe('200');
    await fireEvent.keyDown(handle, { key: 'ArrowRight' });
    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('216'));
    const stage = within(table())
      .getAllByRole('columnheader')[1]
      ?.querySelector('button') as HTMLElement;
    await fireEvent.keyDown(stage, { key: 'ArrowLeft', altKey: true, shiftKey: true });
    await waitFor(() => expect(headers()).toEqual(['Stage', 'Name', 'Amount', 'Closes', 'Active']));
    expect(
      view()
        .columns.map((c) => c.key)
        .slice(0, 2)
    ).toEqual(['stage', 'name']);
  });

  it('resizes and reorders columns with the pointer', async () => {
    const { view } = grid();
    const handle = screen.getByRole('separator', { name: 'Resize Name' });
    await fireEvent.pointerDown(handle, { clientX: 200 });
    await fireEvent.pointerMove(window, { clientX: 260 });
    await fireEvent.pointerUp(window);
    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('260'));
    await fireEvent.pointerMove(window, { clientX: 400 }); // released: no change
    expect(handle.getAttribute('aria-valuenow')).toBe('260');
    const name = within(table()).getAllByRole('columnheader')[0] as HTMLElement;
    await fireEvent.pointerDown(name, { clientX: 10 });
    await fireEvent.pointerMove(window, { clientX: 50 });
    await fireEvent.pointerUp(window);
    await waitFor(() => expect(headers()).toEqual(['Stage', 'Name', 'Amount', 'Closes', 'Active']));
    expect(view().columns.find((c) => c.key === 'name')?.width).toBe(260);
  });

  it('sorts from the header and groups rows with aggregates', async () => {
    grid({
      view: { ...emptyView(), groupBy: 'stage' },
      aggregates: [{ fn: 'sum', key: 'amount' }],
    });
    const group = cell(0, 0);
    expect(group.closest('[role="row"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(group.textContent).toMatch(/lead.*7 rows.*sum amount/s);
    group.focus();
    await press('Enter');
    await waitFor(() =>
      expect(cell(0, 0).closest('[role="row"]')?.getAttribute('aria-expanded')).toBe('false')
    );
    expect(cell(1, 0).textContent).toContain('lost');

    const amount = screen.getByRole('button', { name: 'Amount' });
    await fireEvent.click(amount);
    await waitFor(() =>
      expect(amount.closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('ascending')
    );
    await fireEvent.click(amount);
    await waitFor(() =>
      expect(amount.closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('descending')
    );
  });

  it('applies, saves, renames and deletes saved views through callbacks', async () => {
    const saved: SavedView[] = [
      {
        id: 'v1',
        name: 'Won deals',
        columns: [],
        sort: [{ key: 'amount', direction: 'desc' }],
        groupBy: null,
        filter: { type: 'condition', field: 'stage', operator: 'eq', value: 'won' },
        density: 'compact',
      },
    ];
    const onCreateView = vi.fn(async (_name: string, _view: GridViewState) => {});
    const onRenameView = vi.fn(async (_view: SavedView, _name: string) => {});
    const onDeleteView = vi.fn(async (_view: SavedView) => {});
    const { view } = grid({ savedViews: saved, onCreateView, onRenameView, onDeleteView });
    await fireEvent.change(screen.getByLabelText('View'), { target: { value: 'v1' } });
    await waitFor(() => expect(screen.getByText('7 rows')).toBeTruthy());
    expect(view().density).toBe('compact');

    await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('View name');
    await fireEvent.input(field, { target: { value: 'Big wins' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(onRenameView).toHaveBeenCalledWith(saved[0], 'Big wins'));

    await fireEvent.click(screen.getByRole('button', { name: 'Save as new view' }));
    await fireEvent.input(screen.getByLabelText('New view name'), { target: { value: 'Mine' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onCreateView).toHaveBeenCalledWith(
        'Mine',
        expect.objectContaining({ density: 'compact' })
      )
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete view' }));
    await waitFor(() => expect(onDeleteView).toHaveBeenCalledWith(saved[0]));
    await waitFor(() => expect(screen.getByText('20 rows')).toBeTruthy());
  });

  it('filters from the builder and holds an incomplete condition back', async () => {
    const { view } = grid();
    await fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    // The builder loads on first open.
    await fireEvent.click(await screen.findByRole('button', { name: 'Add a filter' }));
    // "Name is (empty text)" is still being typed: the rows stay, with a note.
    expect(screen.getByRole('status').textContent).toMatch(/One condition needs a value/);
    expect(screen.getByText('20 rows')).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'contains' } });
    await fireEvent.input(screen.getByLabelText('Value'), { target: { value: '001' } });
    await waitFor(() => expect(screen.getByText('11 rows')).toBeTruthy()); // Deal 0001 and 0010–0019
    expect(screen.getByRole('status').textContent?.trim()).toBe('');
    expect(view().filter).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'name', operator: 'contains', value: '001' }],
    });
  });

  it('lists the same rows as cards for phones, paged', async () => {
    const onRowOpen = vi.fn();
    grid({ onRowOpen }, deals(120));
    const cards = screen.getByRole('list', { name: 'Deals' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(51);
    await fireEvent.click(within(cards).getByRole('button', { name: /Deal 0003/ }));
    expect(onRowOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd3' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Show more (70 left)' }));
    expect(within(cards).getAllByRole('listitem')).toHaveLength(101);
  });

  it('shows loading and error states', () => {
    render(DataGrid<Deal>, {
      query: { current: undefined, loading: true, error: undefined },
      columns: COLUMNS,
      getRowId: (d: Deal) => d.id,
      label: 'Deals',
    });
    expect(screen.queryByRole('grid')).toBeNull();
  });
});

describe('FilterBuilder', () => {
  function builder(initial: FilterNode | null = null) {
    let value: FilterNode | null = initial;
    render(FilterBuilder<Deal>, {
      columns: COLUMNS,
      label: 'Deal filters',
      value: initial,
      onchange: (next: FilterNode | null) => {
        value = next;
      },
    });
    return () => value;
  }

  it('builds a nested and/or filter AST with labelled controls', async () => {
    const value = builder();
    const region = screen.getByRole('region', { name: 'Deal filters' });
    await fireEvent.click(within(region).getByRole('button', { name: 'Add a filter' }));
    expect(value()).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'name', operator: 'eq', value: '' }],
    });
    // Field → Stage, condition → "is any of", tick two values.
    await fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'stage' } });
    await fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'in' } });
    await fireEvent.click(screen.getByLabelText('won'));
    await fireEvent.click(screen.getByLabelText('lost'));
    // A nested OR group on amount.
    await fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    const nested = document.querySelectorAll<HTMLElement>('[data-filter-group]')[1] as HTMLElement;
    await fireEvent.change(within(nested).getByLabelText(/Match/), { target: { value: 'or' } });
    await fireEvent.change(within(nested).getByLabelText('Field'), { target: { value: 'amount' } });
    await fireEvent.change(within(nested).getByLabelText('Condition'), {
      target: { value: 'between' },
    });
    await fireEvent.input(within(nested).getByLabelText('From'), { target: { value: '100' } });
    await fireEvent.input(within(nested).getByLabelText('To'), { target: { value: '900' } });
    expect(value()).toEqual({
      type: 'group',
      op: 'and',
      children: [
        { type: 'condition', field: 'stage', operator: 'in', value: ['won', 'lost'] },
        {
          type: 'group',
          op: 'or',
          children: [
            { type: 'condition', field: 'amount', operator: 'between', value: [100, 900] },
          ],
        },
      ],
    });
    // Every add/remove button has a name.
    expect(screen.getAllByRole('button', { name: /^Remove condition \d$/ })).toHaveLength(2);
    await fireEvent.click(within(nested).getByRole('button', { name: 'Remove group' }));
    expect((value() as { children: unknown[] }).children).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(value()).toBeNull();
  });

  it('shows the empty-value operators without a value field', async () => {
    const value = builder({ type: 'condition', field: 'closes', operator: 'isEmpty' });
    expect(screen.queryByLabelText('Value')).toBeNull();
    await fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'before' } });
    await fireEvent.input(screen.getByLabelText('Value'), { target: { value: '2026-11-05' } });
    expect(value()).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'closes', operator: 'before', value: '2026-11-05' }],
    });
  });
});

describe('grid model helpers', () => {
  it('drops conditions still being typed from the applied filter', () => {
    const name = { type: 'condition', field: 'name', operator: 'eq', value: 'x' } as const;
    expect(
      completeFilter({
        type: 'group',
        op: 'or',
        children: [
          name,
          { type: 'condition', field: 'name', operator: 'eq', value: '' },
          { type: 'condition', field: 'amount', operator: 'between', value: [1, ''] },
          {
            type: 'group',
            op: 'and',
            children: [{ type: 'condition', field: 'stage', operator: 'in', value: [] }],
          },
          { type: 'condition', field: 'closes', operator: 'isEmpty' },
        ],
      })
    ).toEqual({
      node: {
        type: 'group',
        op: 'or',
        children: [name, { type: 'condition', field: 'closes', operator: 'isEmpty' }],
      },
      incomplete: 3,
    });
    expect(completeFilter(null)).toEqual({ node: null, incomplete: 0 });
  });

  it('cycles sort and parses editor values by type', () => {
    expect(nextSort([], 'a', false)).toEqual([{ key: 'a', direction: 'asc' }]);
    expect(nextSort([{ key: 'a', direction: 'asc' }], 'a', false)).toEqual([
      { key: 'a', direction: 'desc' },
    ]);
    expect(nextSort([{ key: 'a', direction: 'desc' }], 'a', false)).toEqual([]);
    expect(nextSort([{ key: 'a', direction: 'asc' }], 'b', true)).toEqual([
      { key: 'a', direction: 'asc' },
      { key: 'b', direction: 'asc' },
    ]);
    const amount = COLUMNS[2] as DataGridColumn<Deal>;
    expect(parseEditorValue(amount, '12')).toBe(12);
    expect(parseEditorValue(amount, '')).toBeNull();
    expect(parseEditorValue(COLUMNS[4] as DataGridColumn<Deal>, true)).toBe(true);
  });
});
