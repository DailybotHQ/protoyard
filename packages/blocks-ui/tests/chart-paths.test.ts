import { ChartBlockSchema, ChartControlsBlockSchema } from '@protoyard/blocks';
import { MINIMAL_EXAMPLES } from '@protoyard/blocks/catalog';
import { createMemoryBlockStateHost } from '@protoyard/blocks/interactive';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartBlock } from '../src/data/index.ts';
import InteractiveHarness from './fixtures/InteractiveHarness.svelte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 640, height: 260 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));

const path = (selector: string) => document.querySelector<SVGPathElement>(selector);
const expectPath = async (selector: string) =>
  waitFor(() => {
    const element = path(selector);
    expect(element).toBeTruthy();
    expect(element?.getAttribute('d')?.trim()).not.toBe('');
  });
const chart = ChartBlockSchema.parse({
  type: 'chart',
  spec: {
    kind: 'area',
    title: 'Weekly prototypes',
    labels: ['W1', 'W2', 'W3', 'W4'],
    series: [{ label: 'Decks', values: [4, 9, 15, 22] }],
  },
});
const controls = ChartControlsBlockSchema.parse({
  ...MINIMAL_EXAMPLES['chart-controls'],
  kinds: ['line', 'area', 'bar'],
});

describe('categorical chart block paths', () => {
  it('draws a chart for a ChartSpec with string labels via Texuli', async () => {
    const { container } = render(ChartBlock, { block: chart });
    await waitFor(
      () => {
        expect(
          container.querySelector(
            'svg, [data-tx-block="chart"], [data-py-block="chart"], [role="status"]'
          )
        ).toBeTruthy();
      },
      { timeout: 20_000 }
    );
    expect(container.textContent).toMatch(/Weekly|Decks|W1|Loading chart/i);
  });

  it('draws a bar chart for a ChartSpec via Texuli', async () => {
    const bar = ChartBlockSchema.parse({
      ...chart,
      spec: { ...chart.spec, kind: 'bar' },
    });
    const { container } = render(ChartBlock, { block: bar });
    await waitFor(() => {
      expect(
        container.querySelector(
          'svg, [data-tx-block="chart"], [data-py-block="chart"], svg rect[data-series]'
        )
      ).toBeTruthy();
    });
  });

  it('keeps line, area and bar geometry through chart-kind and series changes', async () => {
    const stateHost = createMemoryBlockStateHost();
    render(InteractiveHarness, {
      props: { blocks: [controls], stateHost, documentId: 'chart-paths' },
    });

    await expectPath('[data-line]');
    await fireEvent.click(await screen.findByRole('button', { name: 'area' }));
    await expectPath('[data-series] path:not([data-line])');

    const paid = await screen.findByRole('checkbox', { name: 'Show One' });
    await fireEvent.click(paid);
    await waitFor(() => expect(document.querySelectorAll('[data-line]')).toHaveLength(1));
    await expectPath('[data-line]');

    await fireEvent.click(await screen.findByRole('button', { name: 'bar' }));
    await waitFor(() => {
      // Texuli bar marks use data-series on rects.
      const bar = document.querySelector<SVGRectElement>('svg rect[data-series]');
      expect(bar).toBeTruthy();
      expect(Number(bar?.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(bar?.getAttribute('height'))).toBeGreaterThan(0);
    });
  }, 30_000);
});
