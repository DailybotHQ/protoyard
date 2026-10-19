<script lang="ts">
import type { Rect } from '@protoyard/charts';
import { groupOffsets, linePath } from '@protoyard/charts/shapes';
import Axis from '../interaction/Axis.svelte';
import Grid from '../interaction/Grid.svelte';
import InteractivePlot from '../interaction/InteractivePlot.svelte';
import type { ChartFormatters, ChartSelection, PlotSeries } from '../interaction/model.ts';
import {
  type CartesianSeries,
  categoryAxis,
  colorFor,
  comboRoles,
  valueAxis,
  xValues,
} from './model.ts';

type Props = {
  label: string;
  series: readonly CartesianSeries[];
  hidden: ReadonlySet<string>;
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  leftFormat: (value: number) => string;
  rightFormat: (value: number) => string;
  onselect?: (selection: ChartSelection) => void;
};

let {
  label,
  series,
  hidden,
  width,
  height,
  plot,
  formatters,
  leftFormat,
  rightFormat,
  onselect,
}: Props = $props();

const layout = $derived.by(() => {
  const roles = comboRoles(series);
  const keys = xValues(series, 'category');
  const names = keys.map((k) => formatters.x(k));
  const categories = categoryAxis(names, [plot.x, plot.x + plot.width]);
  const visible = series.filter((s) => !hidden.has(s.id));
  const side = (s: CartesianSeries) => roles.get(s.id)?.axis ?? 'left';
  const kind = (s: CartesianSeries) => roles.get(s.id)?.type ?? 'line';
  const valuesOn = (axis: 'left' | 'right') =>
    visible
      .filter((s) => side(s) === axis)
      .flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v !== null));
  const range: [number, number] = [plot.y + plot.height, plot.y];
  const left = valueAxis(valuesOn('left'), range, { zero: true, format: leftFormat });
  const right = valueAxis(valuesOn('right'), range, { zero: true, format: rightFormat });
  const barSeries = visible.filter((s) => kind(s) === 'bar');
  const band = categories.scale.bandwidth();
  const groups = groupOffsets(band, Math.max(1, barSeries.length), 0.12);
  const centre = (j: number) => (categories.scale(names[j] as string) as number) + band / 2;

  const bars: {
    id: string;
    series: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
  }[] = [];
  const lines: { id: string; d: string; color: string }[] = [];
  const plotted: PlotSeries[] = series.map((s, i) => {
    const scale = side(s) === 'left' ? left.scale : right.scale;
    const bar = barSeries.indexOf(s);
    const points = keys.map((key, j) => {
      const raw = s.points.find((p) => p.x === key);
      const v = raw?.y ?? null;
      if (bar >= 0 && v !== null) {
        const x =
          (categories.scale(names[j] as string) as number) + (groups.offsets[bar] as number);
        const top = scale(v);
        const zero = scale(0);
        bars.push({
          id: `${s.id}:${j}`,
          series: s.id,
          x,
          y: Math.min(top, zero),
          w: groups.width,
          h: Math.abs(zero - top),
          color: colorFor(s, i),
        });
        return {
          x: x + groups.width / 2,
          y: top,
          xValue: names[j] as string,
          yValue: v,
          datum: raw?.datum,
        };
      }
      return {
        x: centre(j),
        y: v === null || hidden.has(s.id) ? null : scale(v),
        xValue: names[j] as string,
        yValue: v,
        datum: raw?.datum,
      };
    });
    if (kind(s) === 'line' && !hidden.has(s.id))
      lines.push({ id: s.id, d: linePath(points), color: colorFor(s, i) });
    return { id: s.id, label: s.label, color: colorFor(s, i), points };
  });
  return { categories, left, right, bars, lines, plotted };
});
</script>

<InteractivePlot {label} series={layout.plotted} {hidden} {width} {height} {plot} {formatters} {onselect}>
  <Grid positions={layout.left.ticks.map((t) => t.position)} {plot} />
  <Axis orientation="left" ticks={layout.left.ticks} {plot} />
  <Axis orientation="right" ticks={layout.right.ticks} {plot} />
  <Axis orientation="bottom" ticks={layout.categories.ticks} {plot} />
  {#each layout.bars as bar (bar.id)}
    <rect data-bar={bar.id} data-series={bar.series} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx="2" fill={bar.color} />
  {/each}
  {#each layout.lines as line (line.id)}
    <path data-line={line.id} d={line.d} fill="none" stroke={line.color} stroke-width="2.5" stroke-linejoin="round" />
  {/each}
</InteractivePlot>
