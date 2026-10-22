import {
  type ChartBlock,
  ChartBlockSchema,
  StatBlockSchema,
  TableBlockSchema,
} from '@protoyard/blocks';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BlockFamilyRenderer,
  ChartBlock as ChartBlockView,
  chartItems,
  chartSeries,
  chartValueFormatter,
  columnAlign,
  formatCents,
  formatTableCell,
  isCartesianChart,
} from '../src/data/index.ts';
import { blockRendererRegistry, loadBlockFamily } from '../src/registry.ts';
import RendererHarness from './fixtures/RendererHarness.svelte';

afterEach(cleanup);

// The charts-ui families load on demand; warm them once so tests never race a cold import.
beforeAll(async () => {
  await Promise.all([
    import('@protoyard/charts-ui/cartesian'),
    import('@protoyard/charts-ui/part-whole'),
    import('@protoyard/charts-ui/compact'),
  ]);
}, 30_000);

const stat = StatBlockSchema.parse({
  type: 'stat',
  title: 'Quarter at a glance',
  items: [
    { value: '$1.2M', label: 'Revenue', delta: '+12%', deltaTone: 'success', trend: [3, 4, 6, 9] },
    { value: '87%', label: 'Retention', delta: '-2 pts', deltaTone: 'danger', context: 'vs Q2' },
    { value: '42', label: 'New accounts' },
  ],
  source: 'Fictional data',
});

const table = TableBlockSchema.parse({
  type: 'table',
  caption: 'Plans by revenue',
  currency: 'EUR',
  columns: [
    { label: 'Plan' },
    { label: 'Seats', format: 'number' },
    { label: 'Share', format: 'percent' },
    { label: 'Revenue', format: 'cents' },
  ],
  rows: [
    ['Starter', 1200, 0.25, 123450],
    ['Team', 640, 0.5, 9876500],
    ['Enterprise', null, 0.25, null],
  ],
  highlightRow: 1,
});

const bars = ChartBlockSchema.parse({
  type: 'chart',
  spec: {
    kind: 'bar',
    title: 'Revenue by month',
    unit: 'cents',
    currency: 'USD',
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ label: 'Revenue', values: [120000, 98000, null] }],
  },
});

const donut = ChartBlockSchema.parse({
  type: 'chart',
  spec: {
    kind: 'donut',
    title: 'Plan mix',
    unit: 'percent',
    labels: ['Starter', 'Team'],
    series: [{ label: 'Share', values: [0.4, 0.6] }],
  },
  showTable: true,
});

describe('data formatting', () => {
  it('formats integer cents as currency and table cells by column', () => {
    expect(formatCents(123450, 'USD')).toBe('$1,234.50');
    expect(formatCents(9876500, 'EUR')).toBe('€98,765.00');
    expect(formatTableCell(123450, 'cents', 'USD')).toBe('$1,234.50');
    expect(formatTableCell(0.255, 'percent')).toBe('25.5%');
    expect(formatTableCell(1234.567, 'number')).toBe('1,234.57');
    expect(formatTableCell('Starter')).toBe('Starter');
    expect(formatTableCell(null, 'cents')).toBe('—');
    expect(columnAlign({ label: 'x', format: 'cents' })).toBe('end');
    expect(columnAlign({ label: 'x' })).toBe('start');
    expect(columnAlign({ label: 'x', format: 'number', align: 'center' })).toBe('center');
  });

  it('splits a chart spec the way charts-ui expects', () => {
    expect(isCartesianChart('bar')).toBe(true);
    expect(isCartesianChart('donut')).toBe(false);
    expect(chartSeries(bars.spec)).toEqual([
      {
        id: 's0',
        label: 'Revenue',
        points: [
          { x: 'Jan', y: 120000 },
          { x: 'Feb', y: 98000 },
          { x: 'Mar', y: null },
        ],
      },
    ]);
    expect(chartItems(donut.spec)).toEqual([
      { id: 'i0', label: 'Starter', value: 0.4 },
      { id: 'i1', label: 'Team', value: 0.6 },
    ]);
    expect(chartValueFormatter(bars.spec)(120000)).toBe('$1,200.00');
    expect(chartValueFormatter({ unit: 'compact' })(1_500_000)).toBe('1.5M');
    expect(chartValueFormatter({})(1234.5)).toBe('1,234.5');
  });
});

describe('StatBlock', () => {
  it('renders each figure as a labelled term with its value, delta tone in words and a sparkline', async () => {
    render(BlockFamilyRenderer, { block: stat });
    const region = screen.getByRole('region', { name: 'Quarter at a glance' });
    const terms = within(region)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual(['Revenue', 'Retention', 'New accounts']);
    const definitions = within(region)
      .getAllByRole('definition')
      .map((d) => d.textContent?.trim());
    expect(definitions).toContain('$1.2M');
    expect(definitions).toContain('+12% (Positive)');
    expect(definitions).toContain('-2 pts (Negative)');
    expect(definitions).toContain('vs Q2');
    expect(within(region).getByText('Source: Fictional data')).toBeTruthy();
    expect(await within(region).findByRole('img', { name: /Revenue trend/ })).toBeTruthy();
  });

  it('names an untitled row "Key figures"', () => {
    render(BlockFamilyRenderer, {
      block: StatBlockSchema.parse({ type: 'stat', items: [{ value: '3', label: 'Open' }] }),
    });
    expect(screen.getByRole('region', { name: 'Key figures' })).toBeTruthy();
  });
});

describe('TableBlock', () => {
  it('renders a captioned table with scoped headers, row headers, alignment and currency', () => {
    render(BlockFamilyRenderer, { block: table });
    const grid = screen.getByRole('table', { name: 'Plans by revenue' });
    const headers = within(grid).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Plan', 'Seats', 'Share', 'Revenue']);
    expect(headers.every((h) => h.getAttribute('scope') === 'col')).toBe(true);
    expect(
      within(grid)
        .getAllByRole('rowheader')
        .map((h) => h.textContent)
    ).toEqual(['Starter', 'Team', 'Enterprise']);
    const team = within(grid).getAllByRole('row')[2] as HTMLElement;
    expect(
      within(team)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['640', '50%', '€98,765.00']);
    expect(team.dataset.highlight).toBe('true');
    expect(within(grid).getAllByText('—')).toHaveLength(2);
    expect(within(grid).getByText('€1,234.50').className).toContain('text-right');
    // The scroll container is a named, focusable region.
    const region = screen.getByRole('region', { name: 'Plans by revenue' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });
});

describe('ChartBlock', () => {
  it('shows the table at once, then the chart with its own table toggle', async () => {
    render(BlockFamilyRenderer, { block: bars });
    const figure = document.querySelector('[data-chart-kind="bar"]') as HTMLElement;
    // Before charts-ui/cartesian arrives, the data is already readable as a table.
    expect(within(figure).getByRole('table', { name: 'Revenue by month' })).toBeTruthy();
    expect(within(figure).getByText('$1,200.00')).toBeTruthy();
    // Then the chart replaces it, named by its title, with charts-ui's toggle.
    await waitFor(() => expect(within(figure).queryByRole('table')).toBeNull());
    expect(within(figure).getByRole('figure', { name: 'Revenue by month' })).toBeTruthy();
    // One toggle only: charts-ui's own (it loads after the plot).
    const toggles = await within(figure).findAllByRole('button', { name: 'View as table' });
    expect(toggles).toHaveLength(1);
    await fireEvent.click(toggles[0] as HTMLElement);
    expect(toggles[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders part-whole charts with the table beside them when showTable is set', async () => {
    render(BlockFamilyRenderer, { block: donut });
    expect(await screen.findByRole('figure', { name: 'Plan mix' })).toBeTruthy();
    const data = screen.getByRole('table', { name: 'Plan mix' });
    expect(within(data).getByText('60%')).toBeTruthy();
  });

  it('shows a note instead of a chart for an invalid spec', () => {
    const invalid = {
      type: 'chart',
      spec: {
        kind: 'pie',
        title: 'Broken',
        labels: ['A', 'B'],
        series: [{ label: 'x', values: [1] }],
      },
    } as unknown as ChartBlock;
    render(ChartBlockView, { block: invalid });
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('This chart could not be shown.');
    expect(note.textContent).toContain('Needs one value per label (2)');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('data family routing', () => {
  it('is the renderer the registry loads for stat, table and chart', async () => {
    for (const type of ['stat', 'table', 'chart'] as const) {
      expect(blockRendererRegistry[type].family).toBe('data');
    }
    expect(await loadBlockFamily('data')).toBe(BlockFamilyRenderer);
  });

  it('renders through the BlockRenderer dispatcher from untrusted data', async () => {
    render(RendererHarness, {
      blocks: [table, { type: 'stat', items: [{ value: '1', label: 'One' }] }],
    });
    expect(await screen.findByRole('table', { name: 'Plans by revenue' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Key figures' })).toBeTruthy();
  });
});
