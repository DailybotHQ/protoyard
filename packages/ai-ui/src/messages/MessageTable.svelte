<script lang="ts">
import type { TableBlock } from '@protoyard/ai/messages';
import { formatCell } from './format.ts';

/** A data table: caption, column headers, aligned cells, a keyboard-scrollable region. */
let { block }: { block: TableBlock } = $props();

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- wide tables scroll; keyboard users must reach them (WCAG 2.1.1). -->
<div
  class="max-w-full overflow-x-auto rounded-lg border border-border"
  data-py-message-block="table"
  role="region"
  aria-label={block.title ?? 'Table'}
  tabindex="0"
>
  <table class="w-full border-collapse text-sm tabular-nums">
    {#if block.title}
      <caption class="px-3 py-2 text-left font-semibold">{block.title}</caption>
    {/if}
    <thead class="bg-muted/70">
      <tr>
        {#each block.columns as column (column.key)}
          <th scope="col" class="border-b border-border px-3 py-2 font-semibold {ALIGN[column.align]}">{column.header}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each block.rows as row, index (index)}
        <tr class="border-b border-border last:border-0">
          {#each block.columns as column (column.key)}
            <td class="px-3 py-1.5 {ALIGN[column.align]}">{formatCell(Object.hasOwn(row, column.key) ? row[column.key] : null)}</td>
          {/each}
        </tr>
      {:else}
        <tr>
          <td class="px-3 py-2 text-muted-foreground" colspan={block.columns.length}>No rows.</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
