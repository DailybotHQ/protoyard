<script lang="ts">
import type { Rect } from '@protoyard/charts';
import { groupOffsets, type StackSpan, stack } from '@protoyard/charts/shapes';
import Axis from '../interaction/Axis.svelte';
import Grid from '../interaction/Grid.svelte';
import InteractivePlot from '../interaction/InteractivePlot.svelte';
import type { ChartFormatters, ChartSelection, PlotSeries } from '../interaction/model.ts';
import {
  type BarMode,
  type CartesianSeries,
  categoryAxis,
  colorFor,
  valueAxis,
  xValues,
} from './model.ts';

type Props = {
  label: string;
  series: readonly CartesianSeries[];
  hidden: ReadonlySet<string>;
  orientation: 'vertical' | 'horizontal';
  mode: BarMode;
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  tickFormat: (value: number) => string;
  showValues: boolean;
  onselect?: (selection: ChartSelection) => void;
};

let {
  label,
  series,
  hidden,
  orientation,
  mode,
  width,
  height,
  plot,
  formatters,
  tickFormat,
  showValues,
  onselect,
}: Props = $props();

const layout = $derived.by(() => {
  const vertical = orientation === 'vertical';
  const keys = xValues(series, 'category');
  const names = keys.map((k) => formatters.x(k));
  const categories = categoryAxis(
    names,
    vertical ? [plot.x, plot.x + plot.width] : [plot.y, plot.y + plot.height]
  );
  const visible = series.filter((s) => !hidden.has(s.id));
  const matrix = visible.map((s) => {
    const byX = new Map(s.points.map((p) => [p.x, p.y]));
    return keys.map((k) => byX.get(k) ?? null);
  });
  const spans: StackSpan[][] =
    mode === 'grouped'
      ? matrix.map((row) => row.map((v) => [0, v ?? 0] as const))
      : stack(matrix, { offset: mode === 'expanded' ? 'expand' : 'diverging' });
  const all = spans.flat().flat();
  const value = valueAxis(
    all,
    vertical ? [plot.y + plot.height, plot.y] : [plot.x, plot.x + plot.width],
    {
      zero: true,
      format: mode === 'expanded' ? (v) => `${Math.round(v * 100)}%` : tickFormat,
    }
  );
  const band = categories.scale.bandwidth();
  const groups = groupOffsets(band, mode === 'grouped' ? Math.max(1, visible.length) : 1, 0.12);

  const bars: {
    id: string;
    key: string;
    series: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    text: string;
    end: [number, number];
  }[] = [];
  const plotted: PlotSeries[] = series.map((s, i) => {
    const k = visible.indexOf(s);
    return {
      id: s.id,
      label: s.label,
      color: colorFor(s, i),
      points: keys.map((key, j) => {
        const raw = s.points.find((p) => p.x === key);
        const span = k >= 0 ? (spans[k] as StackSpan[])[j] : undefined;
        if (!span || raw?.y === null || raw?.y === undefined) {
          // Missing bars keep their category position so pointer lookup stays sorted.
          const centre = (categories.scale(names[j] as string) as number) + band / 2;
          return vertical
            ? {
                x: centre,
                y: null,
                xValue: names[j] as string,
                yValue: raw?.y ?? null,
                datum: raw?.datum,
              }
            : {
                x: Number.NaN,
                y: centre,
                xValue: names[j] as string,
                yValue: null,
                datum: raw?.datum,
              };
        }
        const start =
          (categories.scale(names[j] as string) as number) +
          (mode === 'grouped' ? (groups.offsets[k] as number) : (groups.offsets[0] ?? 0));
        const a = value.scale(span[0]);
        const b = value.scale(span[1]);
        const thick = groups.width;
        const rect = vertical
          ? { x: start, y: Math.min(a, b), w: thick, h: Math.abs(b - a) }
          : { x: Math.min(a, b), y: start, w: Math.abs(b - a), h: thick };
        const end: [number, number] = vertical ? [start + thick / 2, b] : [b, start + thick / 2];
        bars.push({
          id: `${s.id}:${j}`,
          key: names[j] as string,
          series: s.id,
          ...rect,
          color: colorFor(s, i),
          text: formatters.y(raw.y, s.id),
          end,
        });
        // The interaction point sits at the bar's end, where its value is.
        return {
          x: end[0],
          y: end[1],
          xValue: names[j] as string,
          yValue: raw.y,
          datum: raw.datum,
        };
      }),
    };
  });
  return { categories, value, bars, plotted, vertical };
});
</script>

<InteractivePlot
  {label}
  series={layout.plotted}
  {hidden}
  {width}
  {height}
  {plot}
  {formatters}
  {onselect}
  orientation={layout.vertical ? 'x' : 'y'}
>
  <Grid orientation={layout.vertical ? 'horizontal' : 'vertical'} positions={layout.value.ticks.map((t) => t.position)} {plot} />
  <Axis orientation={layout.vertical ? 'left' : 'bottom'} ticks={layout.value.ticks} {plot} />
  <Axis orientation={layout.vertical ? 'bottom' : 'left'} ticks={layout.categories.ticks} {plot} />
  {#each layout.bars as bar (bar.id)}
    <rect
      data-bar={bar.id}
      data-series={bar.series}
      x={bar.x}
      y={bar.y}
      width={Math.max(0, bar.w)}
      height={Math.max(0, bar.h)}
      rx="2"
      fill={bar.color}
      style="transition: all var(--py-chart-duration, 0ms) ease-out"
    />
    {#if showValues && mode !== 'stacked' && mode !== 'expanded'}
      <text
        aria-hidden="true"
        x={layout.vertical ? bar.end[0] : bar.end[0] + 4}
        y={layout.vertical ? bar.end[1] - 4 : bar.end[1]}
        dy={layout.vertical ? 0 : '0.32em'}
        text-anchor={layout.vertical ? 'middle' : 'start'}
        class="fill-foreground text-[10px] tabular-nums">{bar.text}</text
      >
    {/if}
  {/each}
</InteractivePlot>
