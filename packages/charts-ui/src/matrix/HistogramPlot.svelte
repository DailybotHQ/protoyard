<script lang="ts">
import type { Rect } from '@protoyard/charts';
import { seriesColor } from '@protoyard/charts/palette';
import { linearScale } from '@protoyard/charts/scales';
import type { Bin } from '@protoyard/charts/shapes';
import { valueAxis } from '../cartesian/model.ts';
import Axis from '../interaction/Axis.svelte';
import Grid from '../interaction/Grid.svelte';
import InteractivePlot from '../interaction/InteractivePlot.svelte';
import type { ChartFormatters, PlotSeries } from '../interaction/model.ts';

type Props = {
  label: string;
  bins: readonly Bin[];
  rules: readonly { kind: 'mean' | 'median'; value: number }[];
  width: number;
  height: number;
  plot: Rect;
  formatters: ChartFormatters;
  formatX: (value: number) => string;
  color: string;
  onselect?: (bin: Bin) => void;
};

let { label, bins, rules, width, height, plot, formatters, formatX, color, onselect }: Props =
  $props();

const view = $derived.by(() => {
  const lo = bins[0]?.x0 ?? 0;
  const hi = bins.at(-1)?.x1 ?? 1;
  const x = linearScale({
    domain: [lo, hi === lo ? lo + 1 : hi],
    range: [plot.x, plot.x + plot.width],
  });
  const y = valueAxis(
    bins.map((b) => b.count),
    [plot.y + plot.height, plot.y],
    { zero: true, format: (v) => String(Math.round(v)) }
  );
  const edges = [...new Set(bins.flatMap((b) => [b.x0, b.x1]))];
  const step = Math.max(1, Math.ceil((edges.length * 48) / Math.max(1, plot.width)));
  const xTicks = edges
    .filter((_, i) => i % step === 0)
    .map((e) => ({ position: x(e), label: formatX(e) }));
  const rects = bins.map((b, i) => ({
    i,
    x: x(b.x0) + 1,
    w: Math.max(1, x(b.x1) - x(b.x0) - 2),
    y: y.scale(b.count),
    h: Math.max(0, y.scale(0) - y.scale(b.count)),
  }));
  const series: PlotSeries<Bin>[] = [
    {
      id: 'count',
      label: 'Count',
      color,
      points: bins.map((b, i) => ({
        x: (rects[i] as { x: number }).x + (rects[i] as { w: number }).w / 2,
        y: y.scale(b.count),
        xValue: `${formatX(b.x0)}–${formatX(b.x1)}`,
        yValue: b.count,
        datum: b,
      })),
    },
  ];
  return { x, y, xTicks, rects, series };
});
</script>

<InteractivePlot {label} series={view.series} {width} {height} {plot} {formatters} onselect={(s) => s.datum && onselect?.(s.datum)}>
  <Grid positions={view.y.ticks.map((t) => t.position)} {plot} />
  <Axis orientation="left" ticks={view.y.ticks} {plot} />
  <Axis orientation="bottom" ticks={view.xTicks} {plot} />
  {#each view.rects as r (r.i)}
    <rect data-bin={r.i} x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" fill={color} />
  {/each}
  {#each rules as rule (rule.kind)}
    <g aria-hidden="true" data-rule={rule.kind}>
      <line x1={view.x(rule.value)} x2={view.x(rule.value)} y1={plot.y} y2={plot.y + plot.height} stroke="var(--py-foreground)" stroke-dasharray={rule.kind === 'median' ? '4 3' : undefined} stroke-width="1.5" />
      <text x={view.x(rule.value) + 4} y={plot.y + 10} class="fill-foreground text-[10px]">{rule.kind} {formatX(rule.value)}</text>
    </g>
  {/each}
</InteractivePlot>
