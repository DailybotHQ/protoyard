<script lang="ts">
import { type TreemapNode, treemap } from '@protoyard/charts/layout';
import { seriesColor } from '@protoyard/charts/palette';
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import ChartFrame from '../frame/ChartFrame.svelte';
import ItemPlot from './ItemPlot.svelte';
import { formatShare, type PlotItem } from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  root: TreemapNode;
  unit?: ValueUnit;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  /** A leaf was selected (Enter or click); groups drill in instead. */
  onselect?: (node: TreemapNode, path: TreemapNode[]) => void;
};

let {
  title,
  description,
  summary,
  root,
  unit = 'number',
  height = 280,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const format = $derived(valueFormatter({ unit }));
/** Ids from the root to the group being shown. */
let path = $state<string[]>([]);

const sum = (n: TreemapNode): number =>
  n.children?.length ? n.children.reduce((s, c) => s + sum(c), 0) : Math.max(0, n.value ?? 0);
const trail = $derived.by(() => {
  const nodes: TreemapNode[] = [root];
  for (const id of path) {
    const next = (nodes.at(-1) as TreemapNode).children?.find((c) => c.id === id);
    if (!next) break;
    nodes.push(next);
  }
  return nodes;
});
const focus = $derived(trail.at(-1) as TreemapNode);
const total = $derived(sum(focus));

// Validate once per data change so a bad tree shows the error state instead of throwing.
const problem = $derived.by(() => {
  try {
    treemap(root, { width: 1, height: 1 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});

const text = $derived(
  summary ??
    `${title}: ${(focus.children ?? [])
      .map((c) => ({ c, v: sum(c) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map(({ c, v }) => `${c.label ?? c.id} ${formatShare(v, total)}`)
      .join(', ')}.`
);

function layout(width: number, h: number) {
  // One level at a time: the focused group's children fill the box.
  const level: TreemapNode = {
    id: `__focus:${focus.id}`,
    children: (focus.children ?? []).map((c) => ({
      id: c.id,
      ...(c.label ? { label: c.label } : {}),
      value: sum(c),
    })),
  };
  const rects = treemap(level, { width, height: h, padding: 0 }).filter((r) => r.depth === 1);
  const cells = rects.map((r, i) => {
    const node = (focus.children ?? []).find((c) => c.id === r.id) as TreemapNode;
    const w = r.x1 - r.x0;
    const hh = r.y1 - r.y0;
    return {
      r,
      i,
      node,
      w,
      h: hh,
      fits: w >= 64 && hh >= 34,
      group: Boolean(node.children?.length),
    };
  });
  const items: PlotItem[] = cells.map((c) => ({
    id: c.node.id,
    description: `${c.node.label ?? c.node.id}, ${format(c.r.value)}, ${formatShare(c.r.value, total)}${c.group ? ', group: press Enter to open' : ''}`,
    anchor: { x: c.r.x0 + c.w / 2, y: c.r.y0 + c.h / 2 },
  }));
  return { cells, items };
}

function choose(i: number, cells: ReturnType<typeof layout>['cells']) {
  const cell = cells[i];
  if (!cell) return;
  if (cell.group) path = [...path, cell.node.id];
  else onselect?.(cell.node, [...trail, cell.node]);
}
</script>

<ChartFrame
  {title}
  {description}
  summary={text}
  {height}
  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
  {loading}
  empty={!loading && !error && !problem && total === 0 ? (emptyMessage ?? true) : false}
  error={error ?? problem}
  {onretry}
>
  {#snippet children(size)}
    {@const view = layout(size.width, size.height)}
    <ItemPlot
      label="{title}: {focus.label ?? focus.id}"
      items={view.items}
      width={size.width}
      height={size.height}
      onselect={(i) => choose(i, view.cells)}
      onback={() => (path = path.slice(0, -1))}
    >
      {#snippet children({ active })}
        {#each view.cells as c (c.node.id)}
          <g data-item={c.i} data-cell={c.node.id}>
            <rect
              x={c.r.x0 + 1}
              y={c.r.y0 + 1}
              width={Math.max(0, c.w - 2)}
              height={Math.max(0, c.h - 2)}
              rx="3"
              fill={seriesColor(c.i)}
              opacity={active === null || active === c.i ? 0.92 : 0.6}
            />
            {#if c.fits}
              <text aria-hidden="true" x={c.r.x0 + 8} y={c.r.y0 + 18} class="fill-white text-xs font-medium" data-cell-label="">
                {c.node.label ?? c.node.id}{c.group ? ' ›' : ''}
              </text>
              <text aria-hidden="true" x={c.r.x0 + 8} y={c.r.y0 + 32} class="fill-white text-[11px] tabular-nums opacity-90">{format(c.r.value)}</text>
            {/if}
          </g>
        {/each}
      {/snippet}
    </ItemPlot>
  {/snippet}
  {#snippet footer()}
    <nav aria-label="{title} level" class="flex flex-wrap items-center gap-1 text-xs">
      {#each trail as node, depth (node.id)}
        {#if depth > 0}<span aria-hidden="true" class="text-muted-foreground">›</span>{/if}
        {#if depth < trail.length - 1}
          <button
            type="button"
            class="rounded px-1 text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onclick={() => (path = path.slice(0, depth))}>{depth === 0 ? 'All' : (node.label ?? node.id)}</button
          >
        {:else}
          <span aria-current="location" class="font-medium">{depth === 0 ? 'All' : (node.label ?? node.id)}</span>
        {/if}
      {/each}
    </nav>
  {/snippet}
</ChartFrame>
