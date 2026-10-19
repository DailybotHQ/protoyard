<script lang="ts">
import type { Rect } from '@protoyard/charts';
import { downsampleThreshold, largestTriangleThreeBuckets } from '@protoyard/charts/downsample';
import { areaPath, type Curve, linePath, stack } from '@protoyard/charts/shapes';
import { type CanvasLine, type Renderer, useCanvas } from '../canvas/model.ts';
import Axis from '../interaction/Axis.svelte';
import Grid from '../interaction/Grid.svelte';
import InteractivePlot from '../interaction/InteractivePlot.svelte';
import type {
  ChartFormatters,
  ChartSelection,
  PlotPoint,
  PlotSeries,
} from '../interaction/model.ts';
import {
  type CartesianSeries,
  categoryAxis,
  colorFor,
  continuousX,
  type Tick,
  valueAxis,
  type XKind,
  xValues,
} from './model.ts';

type Props = {
  label: string;
  series: readonly CartesianSeries[];
  hidden: ReadonlySet<string>;
  xKind: XKind;
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  tickFormat: (value: number) => string;
  curve: Curve;
  area: boolean;
  stacked: boolean;
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
  curve,
  area,
  stacked,
  renderer,
  onselect,
}: Props = $props();

type Px = PlotPoint & { y0: number };

const toNumber = (x: number | string) => (typeof x === 'number' ? x : Date.parse(x));

const layout = $derived.by(() => {
  const visible = series.filter((s) => !hidden.has(s.id));
  const keys = xValues(series, xKind);
  // x position of a value.
  let X: (x: number | string) => number;
  let xTicks: Tick[];
  if (xKind === 'category') {
    const axis = categoryAxis(keys.map(String), [plot.x, plot.x + plot.width], 0.1);
    X = (x) => ((axis.scale(String(x)) ?? Number.NaN) as number) + axis.scale.bandwidth() / 2;
    xTicks = axis.ticks;
  } else {
    const axis = continuousX(xKind, keys.map(toNumber), plot);
    X = (x) => axis.scale(toNumber(x));
    xTicks = axis.ticks;
  }
  // Stacked areas share x slots; each visible series adds onto the ones before it.
  const spans = new Map<string, Map<number | string, readonly [number, number]>>();
  let values: number[];
  if (stacked) {
    const matrix = visible.map((s) => {
      const byX = new Map(s.points.map((p) => [p.x, p.y]));
      return keys.map((k) => byX.get(k) ?? null);
    });
    const stacks = stack(matrix);
    visible.forEach((s, k) => {
      spans.set(
        s.id,
        new Map(
          keys.map((key, i) => [
            key,
            (stacks[k] as (readonly [number, number])[])[i] as readonly [number, number],
          ])
        )
      );
    });
    values = stacks.flat().flat();
  } else {
    values = visible.flatMap((s) =>
      s.points.map((p) => p.y).filter((v): v is number => v !== null)
    );
  }
  const y = valueAxis(values, [plot.y + plot.height, plot.y], {
    zero: area || stacked,
    format: tickFormat,
  });
  const base = y.scale(Math.max(y.scale.domain[0], Math.min(0, y.scale.domain[1])));
  const threshold = downsampleThreshold(plot.width);

  const built = series.map((s, i) => {
    const sp = spans.get(s.id);
    const points: Px[] = s.points.map((p) => {
      const span = sp?.get(p.x);
      const top = span ? span[1] : p.y;
      return {
        x: X(p.x),
        y: top === null || top === undefined || p.y === null ? null : y.scale(top),
        y0: span ? y.scale(span[0]) : base,
        xValue: p.x,
        yValue: p.y,
        datum: p.datum,
      };
    });
    // Dense lines: keep the shape with a fraction of the points (LTTB keeps gaps and extremes).
    const drawn =
      points.length > threshold ? largestTriangleThreeBuckets(points, threshold) : points;
    return { s, i, points, drawn };
  });
  const visibleDrawn = built
    .filter((b) => !hidden.has(b.s.id))
    .reduce((n, b) => n + b.drawn.length, 0);
  const canvas = useCanvas(renderer, 'line', visibleDrawn);

  const plotted: PlotSeries[] = [];
  const paths: { id: string; line: string; area: string; color: string; dashed: boolean }[] = [];
  const canvasLines: CanvasLine[] = [];
  for (const { s, i, points, drawn } of built) {
    // On Canvas, hover and keys use every point (bisect stays O(log n)); pixels get min/max per column.
    plotted.push({
      id: s.id,
      label: s.label,
      color: colorFor(s, i),
      points: canvas ? points : drawn,
    });
    if (hidden.has(s.id)) continue;
    if (canvas) {
      canvasLines.push({
        id: s.id,
        color: colorFor(s, i),
        dashed: s.comparison === true,
        points,
        fill: area,
      });
      continue;
    }
    paths.push({
      id: s.id,
      color: colorFor(s, i),
      dashed: s.comparison === true,
      line: linePath(drawn, { curve }),
      area: area
        ? areaPath(
            drawn.map((p) => ({ x: p.x, y0: p.y0, y1: p.y })),
            { curve }
          )
        : '',
    });
  }
  return { xTicks, yTicks: y.ticks, plotted, paths, canvasLines, canvas };
});
</script>

{#if layout.canvas}
  <!-- Loaded only for dense data: SVG-only charts never download the Canvas code. -->
  {#await import('../canvas/CanvasMarks.svelte') then { default: CanvasMarks }}
    <CanvasMarks {width} {height} lines={layout.canvasLines} />
  {/await}
{/if}
<InteractivePlot {label} series={layout.plotted} {hidden} {width} {height} {plot} {formatters} {onselect}>
  <Grid positions={layout.yTicks.map((t) => t.position)} {plot} />
  <Axis orientation="left" ticks={layout.yTicks} {plot} />
  <Axis orientation="bottom" ticks={layout.xTicks} {plot} />
  {#each layout.paths as p (p.id)}
    <g data-series={p.id}>
      {#if area}<path d={p.area} fill={p.color} fill-opacity={p.dashed ? 0.06 : 0.18} stroke="none" />{/if}
      <path
        data-line=""
        d={p.line}
        fill="none"
        stroke={p.color}
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        stroke-dasharray={p.dashed ? '5 4' : undefined}
        opacity={p.dashed ? 0.75 : 1}
      />
    </g>
  {/each}
</InteractivePlot>
