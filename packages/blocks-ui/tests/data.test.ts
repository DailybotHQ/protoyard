import {
  type ChartBlock,
  ChartBlockSchema,
  StatBlockSchema,
  TableBlockSchema,
} from '@protoyard/blocks';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import {
  BlockFamilyRenderer,
  ChartBlock as ChartBlockView,
  chartItems,
  chartSeries,
  chartValueFormatter,
  chartXKind,
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
  it('renders each figure label and value through Texuli data', async () => {
    const { container } = render(BlockFamilyRenderer, { block: stat });
    expect(container.textContent).toContain('Revenue');
    expect(container.textContent).toContain('$1.2M');
    expect(container.textContent).toContain('Retention');
    expect(container.textContent).toMatch(/\+12%|12%/);
  });

  it('renders an untitled stat row', () => {
    const { container } = render(BlockFamilyRenderer, {
      block: StatBlockSchema.parse({ type: 'stat', items: [{ value: '3', label: 'Open' }] }),
    });
    expect(container.textContent).toContain('Open');
    expect(container.textContent).toContain('3');
  });
});

describe('TableBlock', () => {
  it('renders a captioned table through Texuli data', () => {
    const { container } = render(BlockFamilyRenderer, { block: table });
    expect(container.textContent).toContain('Plans by revenue');
    expect(container.textContent).toContain('Plan');
    expect(container.textContent).toContain('Starter');
    expect(container.textContent).toContain('Team');
    const tableEl = container.querySelector('table');
    expect(tableEl).toBeTruthy();
  });
});

describe('ChartBlock', () => {
  it('renders a ChartSpec through the Texuli chart adapter', async () => {
    const { container } = render(BlockFamilyRenderer, { block: bars });
    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-py-block="chart"], [data-tx-block="chart"], [data-chart-kind]'
        )
      ).toBeTruthy();
    });
    await waitFor(
      () => expect(container.textContent).toMatch(/Revenue|Jan|Feb|1200|1,200|Loading chart/i),
      { timeout: 15_000 }
    );
  });

  it('renders part-whole ChartSpec kinds via the adapter', async () => {
    const { container } = render(BlockFamilyRenderer, { block: donut });
    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-py-block="chart"], [data-tx-block="chart"], [data-chart-kind]'
        )
      ).toBeTruthy();
    });
    await waitFor(
      () => expect(container.textContent).toMatch(/Plan mix|Starter|Team|Loading chart/i),
      { timeout: 20_000 }
    );
  });

  it('shows a note instead of a chart for an invalid spec', () => {
    const invalid = {
      type: 'chart',
      spec: { kind: 'bar', title: 'x', labels: [], series: [] },
    } as unknown as ChartBlock;
    const { container } = render(ChartBlockView, { block: invalid });
    expect(container.textContent).toMatch(/could not be shown|invalid|chart/i);
  });

  it('draws line and area charts over free-text labels (category x axis, not dates)', async () => {
    expect(chartXKind({ labels: ['W1', 'W2', 'W3'] })).toBe('category');
    expect(chartXKind({ labels: ['Jan', 'Feb'] })).toBe('category');
    expect(chartXKind({ labels: ['2026-01', '2026-02'] })).toBe('time');
    expect(chartXKind({ labels: ['2026-01-05', 'W2'] })).toBe('category');
    const weekly = ChartBlockSchema.parse({
      type: 'chart',
      spec: {
        kind: 'area',
        title: 'Weekly prototypes',
        labels: ['W1', 'W2', 'W3'],
        series: [{ label: 'Decks', values: [4, 9, 15] }],
      },
    });
    // happy-dom lays nothing out; give the chart a width as a browser would.
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
    render(BlockFamilyRenderer, { block: weekly });
    await screen.findByRole('figure', { name: 'Weekly prototypes' });
    await waitFor(() => {
      const drawn = [...document.querySelectorAll('path[d]')]
        .map((path) => path.getAttribute('d') ?? '')
        .filter((d) => d.length > 0);
      // Before the fix every series path was empty: "W1" parsed as a NaN date.
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn.some((d) => d.includes('NaN'))).toBe(false);
    });
  });

  it('renders part-whole charts with the table beside them when showTable is set', async () => {
    const { container } = render(BlockFamilyRenderer, { block: donut });
    await waitFor(() => {
      expect(
        container.querySelector('[data-py-block="chart"], [data-tx-block="chart"]')
      ).toBeTruthy();
    });
    await waitFor(
      () => expect(container.textContent).toMatch(/Plan mix|Starter|Team|60|Loading chart/i),
      { timeout: 20_000 }
    );
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
    const { container } = render(RendererHarness, {
      blocks: [table, { type: 'stat', items: [{ value: '1', label: 'One' }] }],
    });
    await waitFor(() => expect(container.textContent).toMatch(/Plans by revenue|One|1|Plan/i), {
      timeout: 20_000,
    });
  });
});
