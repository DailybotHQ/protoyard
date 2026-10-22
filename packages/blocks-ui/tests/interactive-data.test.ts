import { ChartBlockSchema, TableBlockSchema } from '@protoyard/blocks';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
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
  it('shows keyboard hover details, supports series toggling, and stays inside the deck', async () => {
    const chart = ChartBlockSchema.parse({
      type: 'chart',
      spec: {
        kind: 'line',
        title: 'Prototype signups',
        labels: ['Week 1', 'Week 2', 'Week 3'],
        series: [
          { label: 'New teams', values: [4, 8, 12] },
          { label: 'Returning teams', values: [2, 3, 5] },
        ],
      },
    });
    class FixedWidthObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 600, height: 260 } } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FixedWidthObserver as unknown as typeof ResizeObserver;
    onTestFinished(() => {
      globalThis.ResizeObserver = original;
    });
    const { container } = render(ChartBlock, { block: chart });
    const root = container.querySelector('[data-py-block="chart"]');
    expect(root?.hasAttribute('data-py-deck-interactive')).toBe(true);

    const plot = await screen.findByRole('group', { name: /Prototype signups/ });
    const svg = plot as unknown as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 220,
        width: 600,
        height: 220,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    await fireEvent.pointerMove(svg, { clientX: 138, clientY: 155 });
    expect(container.querySelector('[data-chart-tooltip]')?.textContent).toContain('Week 1');

    await fireEvent.focus(plot);
    await fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(container.querySelector('[data-chart-live]')?.textContent).toContain('Week 2: 8');
    expect(container.querySelector('[data-chart-tooltip]')).not.toBeNull();

    const legend = await screen.findByRole('list', { name: 'Prototype signups series' });
    const series = within(legend).getByRole('button', { name: 'New teams' });
    expect(series.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(series);
    expect(series.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-py-deck-interactive]')).toBe(root);
  });
});
