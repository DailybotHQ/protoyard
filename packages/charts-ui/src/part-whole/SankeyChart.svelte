<script lang="ts">
import { type SankeyLinkInput, type SankeyNodeInput, sankey } from '@protoyard/charts/layout';
import { seriesColor } from '@protoyard/charts/palette';
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import ChartFrame from '../frame/ChartFrame.svelte';
import ItemPlot from './ItemPlot.svelte';
import type { PlotItem } from './model.ts';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  nodes: readonly SankeyNodeInput[];
  links: readonly SankeyLinkInput[];
  unit?: ValueUnit;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (node: SankeyNodeInput) => void;
};

let {
  title,
  description,
  summary,
  nodes,
  links,
  unit = 'number',
  height = 300,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const uid = $props.id();
let tableShown = $state(false);
const format = $derived(valueFormatter({ unit }));
const LABEL = 96;
// Cycles, unknown nodes and bad values become the error state instead of throwing.
const problem = $derived.by(() => {
  try {
    sankey(nodes, links, { width: 100, height: 100 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});
const colorOf = (id: string) =>
  seriesColor(
    Math.max(
      0,
      nodes.findIndex((n) => n.id === id)
    )
  );
const nameOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
const table = $derived({
  headers: ['Flow', 'From', 'To', 'Value'],
  rows: problem
    ? []
    : links.map((l, i) => ({
        id: `${l.source}>${l.target}:${i}`,
        cells: [
          `${nameOf(l.source)} → ${nameOf(l.target)}`,
          nameOf(l.source),
          nameOf(l.target),
          format(l.value),
        ],
      })),
});
const text = $derived(summary ?? `${title}: ${nodes.length} stages and ${links.length} flows.`);

function layout(width: number, h: number) {
  const result = sankey(nodes, links, {
    width: Math.max(40, width - LABEL),
    height: h,
    nodeWidth: 12,
    nodePadding: 12,
  });
  const flowIn = (id: string) =>
    links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);
  const flowOut = (id: string) =>
    links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0);
  const last = Math.max(0, ...result.nodes.map((n) => n.depth));
  const items: PlotItem[] = result.nodes.map((n) => {
    const parts = [
      flowIn(n.id) ? `${format(flowIn(n.id))} in` : '',
      flowOut(n.id) ? `${format(flowOut(n.id))} out` : '',
    ].filter(Boolean);
    return {
      id: n.id,
      description: `${n.label ?? n.id}, ${parts.join(', ')}`,
      anchor: { x: n.x1, y: (n.y0 + n.y1) / 2 },
    };
  });
  return { ...result, items, last };
}
</script>

<ChartFrame
  {title}
  {description}
  summary={text}
  {height}
  margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
  {loading}
  empty={!loading && !error && !problem && links.length === 0 ? (emptyMessage ?? true) : false}
  error={error ?? problem}
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
      onselect={(i) => nodes[i] && onselect?.(nodes[i])}
    >
      {#snippet children({ active })}
        {#each view.links as link (`${link.source}>${link.target}`)}
          <path
            aria-hidden="true"
            data-link="{link.source}>{link.target}"
            d={link.path}
            fill="none"
            stroke={colorOf(link.source)}
            stroke-width={Math.max(1, link.width)}
            stroke-opacity={active === null || view.nodes[active]?.id === link.source || view.nodes[active]?.id === link.target ? 0.4 : 0.12}
          />
        {/each}
        {#each view.nodes as n, i (n.id)}
          <rect data-item={i} data-node={n.id} x={n.x0} y={n.y0} width={n.x1 - n.x0} height={Math.max(1, n.y1 - n.y0)} rx="2" fill={colorOf(n.id)} />
          <text
            aria-hidden="true"
            x={n.depth === view.last ? n.x0 - 6 : n.x1 + 6}
            y={(n.y0 + n.y1) / 2}
            dy="0.32em"
            text-anchor={n.depth === view.last ? 'end' : 'start'}
            class="fill-foreground text-[11px]">{n.label ?? n.id}</text
          >
        {/each}
      {/snippet}
    </ItemPlot>
    {/if}
  {/snippet}
  {#snippet footer()}
    <div class="flex justify-end">
      {#if table.rows.length > 0 && !loading && !error}
        {#await import('../interaction/TableToggle.svelte') then { default: TableToggle }}
          <TableToggle bind:showing={tableShown} controls="{uid}-table" />
        {/await}
      {/if}
    </div>
  {/snippet}
</ChartFrame>
