import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartFrame from '../src/frame/ChartFrame.svelte';
import FrameProbe from './fixtures/FrameProbe.svelte';

const TOKENS: Record<string, string> = {
  '--py-background': '#ffffff',
  '--py-surface': '#ffffff',
  '--py-destructive': '#dc2626',
  '--py-chart1': '#7c3aed',
  '--py-chart2': '#0284c7',
  '--py-chart3': '#0d9488',
  '--py-chart4': '#b45309',
  '--py-chart5': '#be123c',
};

/** ResizeObserver stand-in that reports a fixed container width. */
class FixedWidthObserver {
  static width = 480;
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: FixedWidthObserver.width, height: 200 },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

const html = document.documentElement;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedWidthObserver);
  for (const [name, value] of Object.entries(TOKENS)) html.style.setProperty(name, value);
  html.dataset.pyMode = 'light';
  html.dataset.pyMotion = 'full';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const name of Object.keys(TOKENS)) html.style.removeProperty(name);
  delete html.dataset.pyMode;
  delete html.dataset.pyMotion;
});

const plot = createRawSnippet((size: () => { width: number; height: number }) => ({
  render: () =>
    `<svg data-testid="plot" data-width="${size().width}" data-height="${size().height}"></svg>`,
}));

describe('ChartFrame', () => {
  it('renders a figure named by its title and described by its description and summary', () => {
    render(ChartFrame, {
      title: 'Weekly signups',
      description: 'Last 12 weeks, UTC',
      summary: 'Signups rose 12% to 1,240.',
      children: plot,
    });
    const figure = screen.getByRole('figure', { name: 'Weekly signups' });
    const described = (figure.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Last 12 weeks, UTC',
      'Signups rose 12% to 1,240.',
    ]);
    expect(figure.hasAttribute('data-py-chart')).toBe(true);
  });

  it('measures its container and passes plot dimensions to the chart and its context', () => {
    FixedWidthObserver.width = 480;
    render(FrameProbe);
    const svg = screen.getByTestId('plot');
    expect(svg.getAttribute('width')).toBe('480');
    expect(svg.getAttribute('height')).toBe('200');
    const ctx = screen.getByTestId('context');
    expect(ctx.dataset.width).toBe('480');
    // Default margin right 12 + overridden left 50; top 8 + bottom 28.
    expect(ctx.dataset.plotWidth).toBe(String(480 - 50 - 12));
    expect(ctx.dataset.plotHeight).toBe(String(200 - 8 - 28));
  });

  it('does not render the chart before the width is known', () => {
    FixedWidthObserver.width = 0;
    render(ChartFrame, { title: 'Revenue', children: plot });
    expect(screen.queryByTestId('plot')).toBeNull();
    FixedWidthObserver.width = 480;
  });

  it('shows loading, empty and error states instead of the chart', async () => {
    const view = render(ChartFrame, { title: 'Revenue', loading: true, children: plot });
    expect(screen.getByRole('status', { name: 'Loading Revenue' })).toBeTruthy();
    expect(screen.getByRole('figure').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('plot')).toBeNull();

    await view.rerender({ title: 'Revenue', loading: false, empty: true, children: plot });
    expect(screen.getByText('No data for this period')).toBeTruthy();
    await view.rerender({ title: 'Revenue', empty: 'No orders yet', children: plot });
    expect(screen.getByText('No orders yet')).toBeTruthy();

    await view.rerender({
      title: 'Revenue',
      empty: false,
      error: 'Could not load revenue',
      children: plot,
    });
    expect(screen.getByRole('alert').textContent).toContain('Could not load revenue');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('retries with pending feedback while the returned promise runs', async () => {
    let finish: () => void = () => {};
    const onretry = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(ChartFrame, { title: 'Revenue', error: 'Offline', onretry, children: plot });
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const pending = screen.getByRole('button', { name: 'Retrying…' });
    expect(pending.hasAttribute('disabled')).toBe(true);
    expect(pending.getAttribute('aria-busy')).toBe('true');
    await fireEvent.click(pending);
    expect(onretry).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
  });

  it('turns motion off when the theme asks for reduced motion, and follows changes', async () => {
    html.dataset.pyMotion = 'reduce';
    render(FrameProbe);
    const figure = screen.getByRole('figure');
    expect(figure.dataset.motion).toBe('reduce');
    expect(figure.getAttribute('style')).toContain('--py-chart-duration: 0ms');
    expect(screen.getByTestId('context').dataset.motion).toBe('reduce');

    html.dataset.pyMotion = 'full';
    await waitFor(() => expect(figure.dataset.motion).toBe('full'));
    expect(figure.getAttribute('style')).toContain(
      '--py-chart-duration: var(--py-motion-base, 200ms)'
    );
  });

  it('applies the validated chart palette from the theme variables, and follows mode changes', async () => {
    render(FrameProbe);
    const figure = screen.getByRole('figure');
    const style = figure.getAttribute('style') ?? '';
    expect(style).toContain('--py-chart1: #7c3aed');
    expect(style).toMatch(/--py-chart8: #[0-9a-f]{6}/);
    expect(style).toMatch(/--py-seq-9: #[0-9a-f]{6}/);
    expect(style).toMatch(/--py-div-1: #[0-9a-f]{6}/);
    expect(screen.getByTestId('context').dataset.hasPalette).toBe('yes');

    html.style.setProperty('--py-background', '#09090b');
    html.style.setProperty('--py-surface', '#18181b');
    html.style.setProperty('--py-chart1', '#4c1d95');
    html.dataset.pyMode = 'dark';
    await waitFor(() => expect(screen.getByTestId('context').dataset.mode).toBe('dark'));
    // #4c1d95 is about 1.6:1 on #18181b, so the frame publishes a repaired, lighter chart1.
    await waitFor(() => expect(figure.getAttribute('style')).toMatch(/--py-chart1: #[0-9a-f]{6}/));
    expect(figure.getAttribute('style')).not.toContain('--py-chart1: #4c1d95');
  });

  it('uses the chart block a theme ships instead of deriving one', () => {
    const themed: Record<string, string> = {};
    [
      '#111111',
      '#222222',
      '#333333',
      '#444444',
      '#555555',
      '#666666',
      '#777777',
      '#888888',
    ].forEach((c, i) => {
      themed[`--py-chart${i + 1}`] = c;
    });
    for (let i = 1; i <= 9; i++) {
      themed[`--py-seq-${i}`] = '#abcdef';
      themed[`--py-div-${i}`] = '#fedcba';
    }
    for (const [name, value] of Object.entries(themed)) html.style.setProperty(name, value);
    render(FrameProbe);
    // The frame sets nothing: the theme's variables already reach the chart from <html>.
    expect(screen.getByRole('figure').getAttribute('style')).not.toMatch(
      /--py-(chart\d|seq-|div-)/
    );
    expect(screen.getByTestId('context').dataset.hasPalette).toBe('yes');
    for (const name of Object.keys(themed)) html.style.removeProperty(name);
  });

  it('falls back to the raw theme tokens when the variables are not hex', () => {
    for (const name of Object.keys(TOKENS)) html.style.removeProperty(name);
    render(FrameProbe);
    expect(screen.getByTestId('context').dataset.hasPalette).toBe('no');
    expect(screen.getByRole('figure').getAttribute('style')).not.toContain('--py-chart1');
  });
});
