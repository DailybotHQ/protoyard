<script lang="ts">
import type { ChartFormatters, PlotSeries } from './model.ts';
import { tableRows } from './model.ts';

let {
  caption,
  series,
  hidden = new Set<string>(),
  formatters,
  xHeader = 'Category',
  pageSize = 50,
}: {
  caption: string;
  series: readonly PlotSeries[];
  hidden?: ReadonlySet<string>;
  formatters: ChartFormatters;
  xHeader?: string;
  pageSize?: number;
} = $props();

let shown = $state(0);
const rows = $derived(tableRows(series));
const limit = $derived(Math.max(pageSize, shown));
const visibleRows = $derived(rows.slice(0, limit));
</script>

<div class="grid gap-2">
  <div class="max-h-80 overflow-auto rounded-lg border border-border">
    <table class="w-full border-collapse text-left text-xs">
      <caption class="sr-only">{caption}</caption>
      <thead class="sticky top-0 bg-surface">
        <tr>
          <th scope="col" class="border-b border-border px-2 py-1.5 font-medium">{xHeader}</th>
          {#each series as s (s.id)}
            <th scope="col" class="border-b border-border px-2 py-1.5 text-right font-medium">
              {s.label}{#if hidden.has(s.id)}<span class="text-muted-foreground"> (hidden)</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.xValue)}
          <tr class="odd:bg-muted/40">
            <th scope="row" class="px-2 py-1 font-normal">{formatters.x(row.xValue)}</th>
            {#each row.cells as cell, k (k)}
              <td class="px-2 py-1 text-right tabular-nums">
                {cell === null ? '—' : formatters.y(cell, (series[k] as PlotSeries).id)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if rows.length > visibleRows.length}
    <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Showing {visibleRows.length} of {rows.length} rows</span>
      <button
        type="button"
        class="rounded-md border border-border bg-surface px-2 py-1 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={() => (shown = limit + pageSize)}
      >
        Show {Math.min(pageSize, rows.length - visibleRows.length)} more
      </button>
    </div>
  {/if}
</div>
