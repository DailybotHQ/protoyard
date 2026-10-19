<script lang="ts">
import { funnelLayout } from '@protoyard/charts/layout';
import { seriesColor } from '@protoyard/charts/palette';
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import ChartFrame from '../frame/ChartFrame.svelte';
import ItemPlot from './ItemPlot.svelte';
import { type FunnelChartStep, formatShare, type PlotItem } from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  steps: readonly FunnelChartStep[];
  orientation?: 'vertical' | 'horizontal';
  unit?: ValueUnit;
  color?: string;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (step: FunnelChartStep, index: number) => void;
};

let {
  title,
  description,
  summary,
  steps,
  orientation = 'vertical',
  unit = 'number',
  color = seriesColor(0),
  height = 260,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const format = $derived(valueFormatter({ unit }));
const input = $derived(
  steps.map((s) => ({ id: s.id, label: s.label, value: s.value ?? s.count ?? 0 }))
);
const first = $derived(input[0]?.value ?? 0);
const last = $derived(input.at(-1)?.value ?? 0);
const pct = (ratio: number | null) => (ratio === null ? '—' : formatShare(ratio, 1));
const text = $derived(
  summary ??
    `${title}: ${format(first)} entered, ${format(last)} reached ${input.at(-1)?.label ?? 'the end'} (${formatShare(last, first)} overall).`
);

const LABEL = 132;
const VALUE = 96;

function layout(width: number, h: number) {
  const vertical = orientation === 'vertical';
  const area = vertical
    ? { x: LABEL, w: Math.max(40, width - LABEL - VALUE), h }
    : { x: 0, w: width, h: h - 40 };
  const geometry = funnelLayout(input, {
    width: area.w,
    height: area.h,
    orientation,
    gap: vertical ? 6 : 10,
  });
  const rows = geometry.map((g, i) => ({
    ...g,
    i,
    x: g.x + (vertical ? area.x : 0),
    y: g.y + (vertical ? 0 : 20),
  }));
  const items: PlotItem[] = rows.map((r) => ({
    id: r.id,
    description: `${r.label}, ${format(r.value)}, ${pct(r.conversion)} of entered${r.i > 0 ? `, ${pct(r.stepConversion)} of the previous step, ${format(r.dropOff)} dropped off` : ''}`,
    anchor: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
  }));
  return { rows, items, vertical };
}
</script>

<ChartFrame
  {title}
  {description}
  summary={text}
  {height}
  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
  {loading}
  empty={!loading && !error && first === 0 ? (emptyMessage ?? true) : false}
  {error}
  {onretry}
>
  {#snippet children(size)}
    {@const view = layout(size.width, size.height)}
    <ItemPlot
      label={title}
      items={view.items}
      width={size.width}
      height={size.height}
      onselect={(i) => steps[i] && onselect?.(steps[i], i)}
    >
      {#snippet children({ active })}
        {#each view.rows as r (r.id)}
          <rect
            data-item={r.i}
            data-step={r.id}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            rx="3"
            fill={color}
            opacity={active === null || active === r.i ? 1 - r.i * (0.5 / Math.max(1, view.rows.length)) : 0.4}
          />
          {#if view.vertical}
            <text aria-hidden="true" x="0" y={r.y + r.height / 2} dy="0.32em" class="fill-foreground text-xs">{r.label}</text>
            <text aria-hidden="true" x={size.width} y={r.y + r.height / 2} dy="0.32em" text-anchor="end" class="fill-foreground text-xs tabular-nums">
              {format(r.value)} · {pct(r.conversion)}
            </text>
          {:else}
            <text aria-hidden="true" x={r.x + r.width / 2} y={r.y - 6} text-anchor="middle" class="fill-foreground text-xs tabular-nums">{pct(r.conversion)}</text>
            <text aria-hidden="true" x={r.x + r.width / 2} y={size.height - 6} text-anchor="middle" class="fill-muted-foreground text-xs">{r.label}</text>
          {/if}
        {/each}
      {/snippet}
      {#snippet tip(i)}
        {@const r = view.rows[i]}
        {#if r}
          <p class="m-0 mb-1 font-medium">{r.label}</p>
          <p class="m-0 tabular-nums">{format(r.value)} · {pct(r.conversion)} of entered</p>
          {#if r.i > 0}
            <p class="m-0 tabular-nums text-muted-foreground">{pct(r.stepConversion)} from previous · {format(r.dropOff)} dropped off</p>
          {/if}
        {/if}
      {/snippet}
    </ItemPlot>
  {/snippet}
</ChartFrame>
