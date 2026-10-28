<script lang="ts">
import type { TableBlock as TableBlockData } from '@protoyard/blocks';
import { Button, cn } from '@protoyard/ui';
import { columnAlign, formatTableCell } from './format.ts';

/**
 * The table itself: the caption is its accessible name, headers are scoped, a
 * leading text column heads each row, numbers align to the end and format by
 * column. Wide tables scroll inside a focusable region so keyboard users can
 * reach every column. With `onsort`, each header is a sort button (the
 * interactive table passes it; a plain table never loads that code).
 */
let {
  block,
  rows,
  sort = null,
  onsort,
}: {
  block: TableBlockData;
  /** The rows to show, with their original index (for highlight and keys). */
  rows: readonly { row: TableBlockData['rows'][number]; index: number }[];
  sort?: { column: number; direction: 'ascending' | 'descending' } | null;
  onsort?: (column: number) => void;
} = $props();

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;
const rowHeaders = $derived(
  (block.columns[0]?.format ?? 'text') === 'text' && block.columns.length > 1
);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be keyboard reachable (WCAG 2.1.1). -->
<div
  class="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring"
  role="region"
  aria-label={block.caption}
  tabindex="0"
>
  <table class="w-full border-collapse text-sm">
    <caption class="px-3 py-2 text-left font-semibold">{block.caption}</caption>
    <thead class="bg-muted/70">
      <tr>
        {#each block.columns as column, c (c)}
          <th
            scope="col"
            class={cn('border-b border-border px-3 py-2 font-semibold', ALIGN[columnAlign(column)])}
            aria-sort={sort?.column === c ? sort.direction : undefined}
          >
            {#if onsort}
              <Button
                type="button"
                class="inline-flex min-h-touch items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                aria-label="Sort by {column.label}"
                onclick={() => onsort(c)}
              >
                {column.label}
                <span aria-hidden="true">{sort?.column === c ? (sort.direction === 'ascending' ? '↑' : '↓') : '↕'}</span>
              </Button>
            {:else}
              {column.label}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as entry (entry.index)}
        {@const row = entry.row}
        {@const r = entry.index}
        <tr
          class={cn(
            'border-b border-border last:border-0',
            block.highlightRow === r && 'bg-primary/10 font-semibold',
            block.interactive?.rowHighlight && 'hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
          )}
          data-highlight={block.highlightRow === r || undefined}
          tabindex={block.interactive?.rowHighlight ? 0 : undefined}
        >
          {#each row as cell, c (c)}
            {@const column = block.columns[c]}
            {@const text = formatTableCell(cell, column?.format, block.currency)}
            {@const cls = cn('px-3 py-1.5', column && ALIGN[columnAlign(column)], column?.format && column.format !== 'text' && 'tabular-nums')}
            {#if c === 0 && rowHeaders}
              <th scope="row" class={cn(cls, 'font-medium')}>{text}</th>
            {:else}
              <td class={cls}>{text}</td>
            {/if}
          {/each}
        </tr>
      {:else}
        <tr><td class="px-3 py-4 text-center text-muted-foreground" colspan={block.columns.length}>No matching rows.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
