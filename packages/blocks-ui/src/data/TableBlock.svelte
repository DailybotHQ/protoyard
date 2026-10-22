<script lang="ts">
import type { TableBlock } from '@protoyard/blocks';
import { cn } from '@protoyard/ui';
import { columnAlign, formatTableCell } from './format.ts';

/**
 * A data table: the caption is its accessible name, headers are scoped, a
 * leading text column heads each row, numbers align to the end and format by
 * column (number, percent, integer cents in the table currency). Wide tables
 * scroll inside a focusable region so keyboard users can reach every column.
 */
let { block }: { block: TableBlock } = $props();

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;
const rowHeaders = $derived(
  (block.columns[0]?.format ?? 'text') === 'text' && block.columns.length > 1
);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be keyboard reachable (WCAG 2.1.1). -->
<div class="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring" role="region" aria-label={block.caption} tabindex="0" data-py-block="table">
  <table class="w-full border-collapse text-sm">
    <caption class="px-3 py-2 text-left font-semibold">{block.caption}</caption>
    <thead class="bg-muted/70">
      <tr>
        {#each block.columns as column, c (c)}
          <th scope="col" class={cn('border-b border-border px-3 py-2 font-semibold', ALIGN[columnAlign(column)])}>{column.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each block.rows as row, r (r)}
        <tr class={cn('border-b border-border last:border-0', block.highlightRow === r && 'bg-primary/10 font-semibold')} data-highlight={block.highlightRow === r || undefined}>
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
      {/each}
    </tbody>
  </table>
</div>
