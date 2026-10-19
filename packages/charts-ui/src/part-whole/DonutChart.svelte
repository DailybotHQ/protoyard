<script lang="ts">
import { seriesColor } from '@protoyard/charts/palette';
import { arcCentroid, arcPath, pie } from '@protoyard/charts/shapes';
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import ChartFrame from '../frame/ChartFrame.svelte';
import ItemPlot from './ItemPlot.svelte';
import {
  formatShare,
  type GroupedSlice,
  groupSmallSlices,
  type PlotItem,
  type Slice,
} from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  data: readonly Slice[];
  unit?: ValueUnit;
  currency?: string;
  /** Hole size as a share of the radius; 0 draws a pie (default 0.62). */
  innerRatio?: number;
  /** Slices below this share fold into "Other" (default 0.03; 0 keeps every slice). */
  otherThreshold?: number;
  otherLabel?: string;
  /** Text in the hole; `false` hides it (default: the formatted total). */
  centerLabel?: string | false;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (slice: GroupedSlice) => void;
};

let {
  title,
  description,
  summary,
  data,
  unit = 'number',
  currency,
  innerRatio = 0.62,
  otherThreshold = 0.03,
  otherLabel = 'Other',
  centerLabel,
  height = 240,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const uid = $props.id();
let tableShown = $state(false);
const format = $derived(valueFormatter({ unit, ...(currency ? { currency } : {}) }));
const slices = $derived(groupSmallSlices(data, otherThreshold, otherLabel));
const total = $derived(slices.reduce((s, x) => s + x.value, 0));
const colorOf = (s: GroupedSlice, i: number) => s.color ?? seriesColor(i);
const describe = (s: GroupedSlice) =>
  `${s.label}, ${format(s.value)}, ${formatShare(s.value, total)}`;
const text = $derived(
  summary ??
    `${title}: ${slices
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((s) => `${s.label} ${formatShare(s.value, total)}`)
      .join(', ')}${slices.length > 3 ? `, and ${slices.length - 3} more` : ''}.`
);

const table = $derived({
  headers: ['Slice', 'Value', 'Share'],
  rows: slices.map((s) => ({
    id: s.id,
    cells: [s.label, format(s.value), formatShare(s.value, total)],
  })),
});

/** Slices, outside labels (only where they fit) and tooltip anchors for a given box. */
function layout(width: number, h: number) {
  const outer = Math.max(10, Math.min(width / 2 - 72, h / 2 - 8));
  const inner = outer * Math.min(0.9, Math.max(0, innerRatio));
  const cx = width / 2;
  const cy = h / 2;
  const angles = pie(
    slices.map((s) => s.value),
    { padAngle: slices.length > 1 ? 0.012 : 0 }
  );
  const arcs = slices.map((s, i) => {
    const a = angles[i] as { startAngle: number; endAngle: number; padAngle: number };
    const geometry = {
      innerRadius: inner,
      outerRadius: outer,
      ...a,
      cornerRadius: inner > 0 ? 2 : 0,
    };
    const [mx, my] = arcCentroid(geometry);
    const [lx, ly] = arcCentroid({ ...geometry, innerRadius: outer + 10, outerRadius: outer + 10 });
    return {
      slice: s,
      i,
      d: arcPath(geometry),
      mid: { x: cx + mx, y: cy + my },
      label: { x: cx + lx, y: cy + ly },
    };
  });
  // Outside labels for slices of 6 % or more, pushed apart vertically per side so they never overlap.
  const labels = arcs
    .filter((a) => total > 0 && a.slice.value / total >= 0.06)
    .map((a) => ({ ...a, y: a.label.y }));
  for (const side of [
    labels.filter((l) => l.label.x >= cx),
    labels.filter((l) => l.label.x < cx),
  ]) {
    side.sort((p, q) => p.y - q.y);
    for (let k = 1; k < side.length; k++) {
      const prev = side[k - 1] as { y: number };
      const cur = side[k] as { y: number };
      if (cur.y - prev.y < 14) cur.y = prev.y + 14;
    }
  }
  const items: PlotItem[] = arcs.map((a) => ({
    id: a.slice.id,
    description: describe(a.slice),
    anchor: a.mid,
  }));
  return { arcs, labels, items, cx, cy, inner };
}
</script>

<ChartFrame
  {title}
  {description}
  summary={text}
  {height}
  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
  {loading}
  empty={!loading && !error && total === 0 ? (emptyMessage ?? true) : false}
  {error}
  {onretry}
>
  {#snippet children(size)}
    {#if tableShown}
      <div id="{uid}-table" class="absolute inset-0 overflow-auto">
        <!-- Loaded on demand: most viewers never open the table. -->
        {#await import('../interaction/ValueTable.svelte') then { default: ValueTable }}
          <ValueTable caption={title} headers={table.headers} rows={table.rows} />
        {/await}
      </div>
    {:else}
    {@const view = layout(size.width, size.height)}
    <ItemPlot
      label={title}
      items={view.items}
      width={size.width}
      height={size.height}
      onselect={(i) => slices[i] && onselect?.(slices[i])}
    >
      {#snippet children({ active })}
        {#each view.arcs as arc (arc.slice.id)}
          <path
            data-item={arc.i}
            data-slice={arc.slice.id}
            d={arc.d}
            transform="translate({view.cx},{view.cy})"
            fill={colorOf(arc.slice, arc.i)}
            opacity={active === null || active === arc.i ? 1 : 0.55}
            stroke="var(--py-surface)"
            stroke-width="1"
            aria-hidden="true"
          />
        {/each}
        {#each view.labels as l (l.slice.id)}
          <text
            aria-hidden="true"
            data-label={l.slice.id}
            x={l.label.x}
            y={l.y}
            dy="0.32em"
            text-anchor={l.label.x >= view.cx ? 'start' : 'end'}
            class="fill-foreground text-[11px]">{l.slice.label} {formatShare(l.slice.value, total)}</text
          >
        {/each}
        {#if view.inner > 24 && centerLabel !== false}
          <text aria-hidden="true" x={view.cx} y={view.cy - 2} text-anchor="middle" class="fill-foreground font-heading text-lg font-semibold tabular-nums">
            {centerLabel ?? format(total)}
          </text>
          {#if centerLabel === undefined}
            <text aria-hidden="true" x={view.cx} y={view.cy + 16} text-anchor="middle" class="fill-muted-foreground text-[11px]">Total</text>
          {/if}
        {/if}
      {/snippet}
    </ItemPlot>
    {/if}
  {/snippet}
  {#snippet footer()}
    <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-1 p-0 text-xs" aria-label="{title} values">
      {#each slices as s, i (s.id)}
        <li class="flex items-center justify-between gap-2" title={s.members ? `Includes ${s.members.length} small slices` : undefined}>
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <span class="size-2.5 shrink-0 rounded-sm" style:background={colorOf(s, i)} aria-hidden="true"></span>
            <span class="truncate">{s.label}</span>
          </span>
          <span class="tabular-nums text-muted-foreground">{format(s.value)} · {formatShare(s.value, total)}</span>
        </li>
      {/each}
    </ul>
    <div class="mt-1 flex justify-end">
      {#if table.rows.length > 0 && !loading && !error}
        {#await import('../interaction/TableToggle.svelte') then { default: TableToggle }}
          <TableToggle bind:showing={tableShown} controls="{uid}-table" />
        {/await}
      {/if}
    </div>
  {/snippet}
</ChartFrame>
