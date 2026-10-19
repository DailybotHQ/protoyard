<script lang="ts">
import type { Rect } from '@protoyard/charts';
import { sqrtScale } from '@protoyard/charts/scales';
import { SYMBOL_TYPES, symbolPath } from '@protoyard/charts/shapes';
import { type CanvasDots, type Renderer, ScatterIndex, useCanvas } from '../canvas/model.ts';
import Axis from '../interaction/Axis.svelte';
import Grid from '../interaction/Grid.svelte';
import InteractivePlot from '../interaction/InteractivePlot.svelte';
import type { ChartFormatters, ChartSelection, PlotSeries } from '../interaction/model.ts';
import { type CartesianSeries, colorFor, continuousX, valueAxis } from './model.ts';

type Props = {
  label: string;
  series: readonly CartesianSeries[];
  hidden: ReadonlySet<string>;
  xKind: 'time' | 'linear';
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  tickFormat: (value: number) => string;
  /** Bubble radius range in px for `size`; points without a size use the minimum. */
  radius: [number, number];
  renderer: Renderer;
  onselect?: (selection: ChartSelection) => void;
};

let {
  label,
  series,
  hidden,
  xKind,
  width,
  height,
  plot,
  formatters,
  tickFormat,
  radius,
  renderer,
  onselect,
}: Props = $props();

const num = (x: number | string) => (typeof x === 'number' ? x : Date.parse(x));

const layout = $derived.by(() => {
  const visible = series.filter((s) => !hidden.has(s.id));
  const x = continuousX(
    xKind,
    visible.flatMap((s) => s.points.map((p) => num(p.x))),
    plot
  );
  const y = valueAxis(
    visible.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null)),
    [plot.y + plot.height, plot.y],
    { format: tickFormat }
  );
  const sizes = visible.flatMap((s) => s.points.map((p) => p.size ?? 0));
  // Area-true bubbles: radius grows with the square root of the size.
  const r = sqrtScale({
    domain: [0, Math.max(1, ...sizes)],
    range: [radius[0], radius[1]],
    clamp: true,
  });
  const count = visible.reduce((n, s) => n + s.points.length, 0);
  const canvas = useCanvas(renderer, 'scatter', count);
  const marks: { id: string; series: string; d: string; color: string }[] = [];
  const dots: CanvasDots[] = [];
  const plotted: PlotSeries[] = series.map((s, i) => {
    const symbol = SYMBOL_TYPES[i % SYMBOL_TYPES.length] ?? 'circle';
    const set: CanvasDots = { id: s.id, color: colorFor(s, i), points: [] };
    const points = s.points
      .map((p, j) => ({ p, j }))
      .sort((a, b) => num(a.p.x) - num(b.p.x))
      .map(({ p, j }) => {
        const px = x.scale(num(p.x));
        const py = p.y === null ? null : y.scale(p.y);
        if (py !== null && !hidden.has(s.id)) {
          const radiusPx = r(p.size ?? 0);
          // Canvas draws circles only; SVG keeps a symbol per series.
          if (canvas) {
            (set.points as { x: number; y: number; r: number }[]).push({
              x: px,
              y: py,
              r: radiusPx,
            });
            return { x: px, y: py, xValue: p.x, yValue: p.y, datum: p.datum };
          }
          marks.push({
            id: `${s.id}:${j}`,
            series: s.id,
            d: symbolPath(symbol, px, py, Math.PI * radiusPx * radiusPx),
            color: colorFor(s, i),
          });
        }
        return { x: px, y: py, xValue: p.x, yValue: p.y, datum: p.datum };
      });
    if (canvas && !hidden.has(s.id)) dots.push(set);
    return { id: s.id, label: s.label, color: colorFor(s, i), points };
  });
  // Pointer hits come from a grid index on Canvas: true 2-D nearest, not nearest-x.
  const index = canvas
    ? new ScatterIndex(
        plotted.map((s) => ({ points: s.points, hidden: hidden.has(s.id) })),
        Math.max(8, radius[1] * 2)
      )
    : null;
  return { x, y, marks, plotted, dots, canvas, index };
});
</script>

{#if layout.canvas}
  <!-- Loaded only for dense data: SVG-only charts never download the Canvas code. -->
  {#await import('../canvas/CanvasMarks.svelte') then { default: CanvasMarks }}
    <CanvasMarks {width} {height} dots={layout.dots} />
  {/await}
{/if}
<InteractivePlot
  {label}
  series={layout.plotted}
  {hidden}
  {width}
  {height}
  {plot}
  {formatters}
  {onselect}
  crosshair="none"
  hitTest={layout.index ? (px, py) => layout.index?.nearest(px, py) ?? null : undefined}
>
  <Grid positions={layout.y.ticks.map((t) => t.position)} {plot} />
  <Axis orientation="left" ticks={layout.y.ticks} {plot} />
  <Axis orientation="bottom" ticks={layout.x.ticks} {plot} />
  {#each layout.marks as m (m.id)}
    <path data-mark={m.id} data-series={m.series} d={m.d} fill={m.color} fill-opacity="0.7" stroke={m.color} />
  {/each}
</InteractivePlot>
