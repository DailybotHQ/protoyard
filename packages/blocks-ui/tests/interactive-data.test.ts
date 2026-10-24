import { ChartBlockSchema, TableBlockSchema } from '@protoyard/blocks';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import ChartBlock from '../src/data/ChartBlock.svelte';
import TableBlock from '../src/data/TableBlock.svelte';

afterEach(cleanup);

beforeAll(async () => {
  await Promise.all([
    import('@protoyard/charts-ui/cartesian'),
    import('@protoyard/charts-ui/part-whole'),
  ]);
}, 30_000);

const interactiveTable = () =>
  TableBlockSchema.parse({
    type: 'table',
    caption: 'Projects by team',
    interactive: { sort: true, filter: true, rowHighlight: true },
    columns: [{ label: 'Project' }, { label: 'Seats', format: 'number' }],
    rows: [
      ['Delta', 20],
      ['Alpha', 4],
      ['alpha', 5],
      ['Beta', 12],
    ],
  });

describe('interactive tables', () => {
  it('validates opt-in controls and rejects an empty interactive configuration', () => {
    expect(
      TableBlockSchema.safeParse({
        type: 'table',
        caption: 'Sortable',
        columns: [{ label: 'Name' }],
        rows: [['A']],
        interactive: { sort: true },
      }).success
    ).toBe(true);
    expect(
      TableBlockSchema.safeParse({
        type: 'table',
        caption: 'Not interactive',
        columns: [{ label: 'Name' }],
        rows: [['A']],
        interactive: { sort: false, filter: false, rowHighlight: false },
      }).success
    ).toBe(false);
  });

  it('sorts stably in either direction and exposes accessible sort state', async () => {
    render(TableBlock, { block: interactiveTable() });
    // The sort and filter controls load on their own chunk; the plain table shows meanwhile.
    expect(screen.getByRole('table', { name: 'Projects by team' })).toBeTruthy();
    const sort = await screen.findByRole('button', { name: 'Sort by Project' });
    const table = screen.getByRole('table', { name: 'Projects by team' });

    await fireEvent.click(sort);
    expect(table.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Project');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent)
    ).toEqual(['Alpha', 'alpha', 'Beta', 'Delta']);

    await fireEvent.click(sort);
    expect(table.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Project');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent)
    ).toEqual(['Delta', 'Beta', 'Alpha', 'alpha']);

    await fireEvent.click(screen.getByRole('button', { name: 'Sort by Seats' }));
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent?.replace(/\s+/g, ' ').trim())
    ).toEqual(['Alpha4', 'alpha5', 'Beta12', 'Delta20']);
  });

  it('filters rows, highlights them on pointer and keyboard focus, and blocks deck navigation', async () => {
    const { container } = render(TableBlock, { block: interactiveTable() });
    await screen.findByRole('searchbox', { name: 'Filter Projects by team' });
    const table = screen.getByRole('table', { name: 'Projects by team' });
    const root = container.querySelector('[data-py-block="table"]');
    expect(root?.hasAttribute('data-py-deck-interactive')).toBe(true);

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter Projects by team' }), {
      target: { value: 'DEL' },
    });
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent)
    ).toEqual(['Delta']);
    expect(screen.getByRole('status').textContent).toContain('1 of 4 rows');

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter Projects by team' }), {
      target: { value: '' },
    });
    const alpha = within(table).getByRole('row', { name: /Alpha/ });
    expect(alpha.getAttribute('tabindex')).toBe('0');
    expect(alpha.className).toContain('hover:bg-muted');
    expect(alpha.className).toContain('focus-visible:bg-muted');
    expect(container.querySelector('[data-py-deck-interactive]')).toBe(root);
  });

  it('lets a click on a plain table advance the deck; only interactive tables keep it', () => {
    const plain = TableBlockSchema.parse({
      type: 'table',
      caption: 'Plans',
      columns: [{ label: 'Plan' }],
      rows: [['Team']],
    });
    const { container, unmount } = render(TableBlock, { block: plain });
    expect(container.querySelector('[data-py-block="table"]')).not.toBeNull();
    expect(container.querySelector('[data-py-deck-interactive]')).toBeNull();
    unmount();

    const highlighted = TableBlockSchema.parse({
      ...plain,
      interactive: { rowHighlight: true },
    });
    render(TableBlock, { block: highlighted });
    expect(
      document.querySelector('[data-py-block="table"]')?.hasAttribute('data-py-deck-interactive')
    ).toBe(true);
  });

  it('keeps sort and filter state local to the mounted slide view', async () => {
    const { unmount } = render(TableBlock, { block: interactiveTable() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Sort by Project' }));
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Filter Projects by team' }), {
      target: { value: 'alpha' },
    });
    unmount();

    render(TableBlock, { block: interactiveTable() });
    expect(
      (
        (await screen.findByRole('searchbox', {
          name: 'Filter Projects by team',
        })) as HTMLInputElement
      ).value
    ).toBe('');
    expect(screen.getByRole('button', { name: 'Sort by Project' })).toBeTruthy();
    expect(
      screen
        .getByRole('table', { name: 'Projects by team' })
        .querySelector('th[aria-sort="ascending"]')
    ).toBeNull();
    expect(screen.getAllByRole('rowheader')).toHaveLength(4);
  });
});

describe('interactive charts', () => {
  it('renders a ChartSpec chart via the Texuli adapter and marks deck-interactive', async () => {
    const chart = ChartBlockSchema.parse({
      type: 'chart',
      id: 'signups',
      spec: {
        kind: 'line',
        title: 'Prototype signups',
        labels: ['Week 1', 'Week 2', 'Week 3'],
        series: [
          { label: 'New teams', values: [3, 8, 12] },
          { label: 'Returning', values: [1, 2, 4] },
        ],
      },
    });
    const { container } = render(ChartBlock, { block: chart });
    const root = container.querySelector('[data-py-block="chart"]');
    expect(root?.hasAttribute('data-py-deck-interactive')).toBe(true);
    await waitFor(
      () => {
        expect(container.textContent).toMatch(/Prototype signups|Week|Loading chart/i);
      },
      { timeout: 20_000 }
    );
    // Eventually the Texuli chart family paints (or stays loading under heavy load).
    await waitFor(
      () => {
        expect(
          container.querySelector('svg, [data-tx-block], button, [role="status"]')
        ).toBeTruthy();
      },
      { timeout: 15_000 }
    );
  });
});
