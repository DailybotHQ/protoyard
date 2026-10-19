<script lang="ts" generics="R">
import { compileFilter, type FilterGroup } from '@protoyard/analytics';
import { DataTable, type DataTableColumn } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { type DrillPath, type DrillStep, drillFilter, pushDrill, truncateDrill } from './model.ts';

type Props = {
  title: string;
  /** All rows the chart summarises; the table shows those matching the drill path. */
  rows: readonly R[];
  columns: DataTableColumn<R>[];
  getRowId: (row: R, index: number) => string;
  /** The current path (data); store it in the route with `toDrillQuery`. */
  path: DrillPath;
  onchange: (path: DrillPath) => void;
  /** The page's own filters, applied before the drill steps. */
  base?: FilterGroup;
  /** The chart; call `drill(step)` from its `onselect`. */
  chart: Snippet<[{ drill: (step: DrillStep) => void; path: DrillPath }]>;
  pageSize?: number;
};

let {
  title,
  rows,
  columns,
  getRowId,
  path,
  onchange,
  base,
  chart,
  pageSize = 10,
}: Props = $props();

const predicate = $derived(compileFilter(drillFilter(path, base)));
const visible = $derived(rows.filter((r) => predicate(r)));
const caption = $derived(
  path.steps.length
    ? `${title}, filtered by ${path.steps.map((s) => s.label).join(' and ')}`
    : `${title}, all rows`
);
const drill = (step: DrillStep) => onchange(pushDrill(path, step));
</script>

<section class="grid gap-3" aria-label={title}>
  {@render chart({ drill, path })}
  <nav aria-label="Drill path" class="flex flex-wrap items-center gap-1 text-xs">
    {#if path.steps.length === 0}
      <span aria-current="location" class="font-medium">All</span>
      <span class="text-muted-foreground">· select a chart element to drill in</span>
    {:else}
      <button
        type="button"
        class="rounded px-1 text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={() => onchange(truncateDrill(path, 0))}>All</button
      >
      {#each path.steps as step, i (step.filter.property)}
        <span aria-hidden="true" class="text-muted-foreground">›</span>
        {#if i < path.steps.length - 1}
          <button
            type="button"
            class="rounded px-1 text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onclick={() => onchange(truncateDrill(path, i + 1))}>{step.label}</button
          >
        {:else}
          <span aria-current="location" class="font-medium">{step.label}</span>
        {/if}
      {/each}
    {/if}
    <span class="ml-auto text-muted-foreground" aria-live="polite">{visible.length} of {rows.length} rows</span>
  </nav>
  <DataTable {columns} rows={visible as R[]} {getRowId} {caption} {pageSize} emptyTitle="No rows match this drill path" />
</section>
