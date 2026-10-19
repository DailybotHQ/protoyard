import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_LINE_POINTS,
  CANVAS_SCATTER_POINTS,
  reduceForPixels,
  resolveColor,
  ScatterIndex,
  useCanvas,
} from '../src/canvas/model.ts';
import LineChart from '../src/cartesian/LineChart.svelte';
import type { CartesianSeries } from '../src/cartesian/model.ts';
import ScatterChart from '../src/cartesian/ScatterChart.svelte';

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

/** A 2-D context that records what it was asked to draw. */
function recorder() {
  const calls = {
    moveTo: 0,
    lineTo: 0,
    stroke: 0,
    fill: 0,
    arc: [] as [number, number, number][],
    clearRect: 0,
    transform: [] as number[][],
  };
  const ctx = {
    calls,
    setTransform: (...a: number[]) => calls.transform.push(a),
    clearRect: () => calls.clearRect++,
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => calls.moveTo++,
    lineTo: () => calls.lineTo++,
    stroke: () => calls.stroke++,
    fill: () => calls.fill++,
    arc: (x: number, y: number, r: number) => calls.arc.push([x, y, r]),
    setLineDash: () => {},
    globalAlpha: 1,
    lineWidth: 1,
    lineJoin: 'miter',
    strokeStyle: '',
    fillStyle: '',
  };
  return ctx;
}

let ctx: ReturnType<typeof recorder>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedWidthObserver);
  vi.stubGlobal('devicePixelRatio', 2);
  ctx = recorder();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const T0 = Date.parse('2026-01-01T00:00:00Z');
const dense = (id: string, n: number, phase = 0): CartesianSeries => ({
  id,
  label: id,
  points: Array.from({ length: n }, (_, i) => ({
    x: T0 + i * 60_000,
    y: Math.round(100 + 40 * Math.sin(i / 300 + phase) + (i === 5000 ? 800 : 0)),
  })),
});

describe('canvas model', () => {
  it('chooses the renderer by count', () => {
    expect(useCanvas('auto', 'line', CANVAS_LINE_POINTS)).toBe(false);
    expect(useCanvas('auto', 'line', CANVAS_LINE_POINTS + 1)).toBe(true);
    expect(useCanvas('auto', 'scatter', CANVAS_SCATTER_POINTS + 1)).toBe(true);
    expect(useCanvas('svg', 'scatter', 1e6)).toBe(false);
    expect(useCanvas('canvas', 'line', 3)).toBe(true);
  });

  it('reduces a line to at most four points per pixel column, keeping spikes and gaps', () => {
    const points = Array.from({ length: 20_000 }, (_, i) => ({
      x: i / 40,
      y: i === 9_000 ? -999 : i === 12_000 ? null : Math.sin(i / 50),
    }));
    const reduced = reduceForPixels(points, 500);
    expect(reduced.length).toBeLessThanOrEqual(2000);
    expect(reduced.some((p) => p.y === -999)).toBe(true);
    expect(reduced.some((p) => p.y === null)).toBe(true);
    expect(reduceForPixels(points.slice(0, 100), 500)).toHaveLength(100);
  });

  it('finds the nearest scatter point through a grid index', () => {
    const index = new ScatterIndex(
      [
        {
          points: [
            { x: 10, y: 10 },
            { x: 100, y: 100 },
            { x: 103, y: 98 },
          ],
        },
        { points: [{ x: 50, y: 50 }], hidden: true },
      ],
      20
    );
    expect(index.nearest(101, 99)).toEqual({ series: 0, index: 1 });
    expect(index.nearest(103, 97)).toEqual({ series: 0, index: 2 });
    expect(index.nearest(12, 9)).toEqual({ series: 0, index: 0 });
    expect(index.nearest(50, 50)).toBeNull();
    expect(index.nearest(300, 300)).toBeNull();
  });

  it('resolves CSS variables, with nested fallbacks, to paintable colors', () => {
    const vars: Record<string, string> = { '--py-chart1': '#7c3aed' };
    const read = (name: string) => vars[name] ?? '';
    expect(resolveColor('var(--py-chart1)', read)).toBe('#7c3aed');
    expect(resolveColor('var(--py-chart6, var(--py-chart1))', read)).toBe('#7c3aed');
    expect(resolveColor('var(--missing)', read)).toBe('#888888');
    expect(resolveColor('#123456', read)).toBe('#123456');
  });
});

describe('LineChart on Canvas', () => {
  it('stays on SVG for one downsampled series and switches to Canvas for many dense ones', async () => {
    render(LineChart, { title: 'One', series: [dense('a', 10_000)], curve: 'linear' });
    expect(document.querySelector('[data-chart-canvas]')).toBeNull();
    expect(document.querySelectorAll('[data-line]')).toHaveLength(1);
    cleanup();
    render(LineChart, {
      title: 'Many',
      series: [0, 1, 2, 3, 4, 5].map((k) => dense(`s${k}`, 10_000, k)),
      curve: 'linear',
    });
    // The Canvas renderer is a lazy chunk: it appears once its import resolves.
    await waitFor(() => expect(document.querySelector('[data-chart-canvas]')).toBeTruthy());
    expect(document.querySelectorAll('[data-line]')).toHaveLength(0);
    // Axes and the interaction layer stay SVG.
    expect(document.querySelector('[data-axis="bottom"]')).toBeTruthy();
    await waitFor(() => expect(ctx.calls.stroke).toBe(6));
    // Plot width 548 px → at most 4 points per column per series.
    expect(ctx.calls.lineTo).toBeLessThanOrEqual(6 * 548 * 4);
    expect(ctx.calls.transform[0]?.slice(0, 1)).toEqual([2]);
    const canvas = document.querySelector('[data-chart-canvas]') as HTMLCanvasElement;
    expect(canvas.width).toBe(1200);
    expect(canvas.style.width).toBe('600px');
  });

  it('draws filled areas, honours renderer="canvas" and keeps the keyboard and table', async () => {
    render(LineChart, {
      title: 'Area',
      series: [dense('a', 300)],
      area: true,
      renderer: 'canvas',
      curve: 'linear',
    });
    await waitFor(() => expect(ctx.calls.fill).toBe(1));
    expect(ctx.calls.stroke).toBe(1);
    const svg = screen.getByRole('group', { name: /^Area/ });
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'End' });
    expect(document.querySelector('[data-chart-live]')?.textContent).toContain('Point 300 of 300');
    await fireEvent.click(await screen.findByRole('button', { name: 'View as table' }));
    expect(await screen.findByText('Showing 50 of 300 rows')).toBeTruthy();
  });

  it('redraws when the data changes', async () => {
    const view = render(LineChart, {
      title: 'Live',
      series: [dense('a', 200)],
      renderer: 'canvas',
    });
    await waitFor(() => expect(ctx.calls.stroke).toBe(1));
    await view.rerender({ title: 'Live', series: [dense('a', 220)], renderer: 'canvas' });
    await waitFor(() => expect(ctx.calls.stroke).toBe(2));
    expect(ctx.calls.clearRect).toBe(2);
  });
});

describe('ScatterChart on Canvas', () => {
  const cloud = (n: number): CartesianSeries => ({
    id: 'accounts',
    label: 'Accounts',
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: (i * 7919) % 1000 })),
  });

  it('switches to Canvas above the threshold and hit-tests the pointer through the grid index', async () => {
    render(ScatterChart, { title: 'Dense', series: [cloud(3000)] });
    await waitFor(() => expect(document.querySelector('[data-chart-canvas]')).toBeTruthy());
    expect(document.querySelectorAll('[data-mark]')).toHaveLength(0);
    await waitFor(() => expect(ctx.calls.arc).toHaveLength(3000));
    const [x, y] = ctx.calls.arc[1234] as [number, number, number];
    const svg = screen.getByRole('group', { name: /^Dense/ });
    await fireEvent.pointerMove(svg, { clientX: x + 1, clientY: y });
    const tip = document.querySelector('[data-chart-tooltip]')?.textContent ?? '';
    expect(tip).toContain('1,234');
    expect(tip).toContain(String((1234 * 7919) % 1000).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  });

  it('keeps SVG symbols below the threshold', () => {
    render(ScatterChart, { title: 'Sparse', series: [cloud(50)] });
    expect(document.querySelector('[data-chart-canvas]')).toBeNull();
    expect(document.querySelectorAll('[data-mark]')).toHaveLength(50);
  });
});
