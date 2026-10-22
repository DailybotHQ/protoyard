<script lang="ts">
import type { TableBlock as TableBlockData } from '@protoyard/blocks';
import { cn } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { columnAlign, formatTableCell } from './format.ts';

/**
 * A data table: the caption is its accessible name, headers are scoped, a
 * leading text column heads each row, numbers align to the end and format by
 * column. Opt-in sorting and filtering are local to this mounted view. Wide
 * tables scroll inside a focusable region so keyboard users can reach columns.
 */
let { block }: { block: TableBlockData } = $props();

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;
const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });
const rowHeaders = $derived(
  (block.columns[0]?.format ?? 'text') === 'text' && block.columns.length > 1
);
let query = $state('');
let sort = $state<{ column: number; direction: 'ascending' | 'descending' } | null>(null);

const visibleRows = $derived.by(() => {
  const filter = query.trim().toLocaleLowerCase('en-US');
  const rows = block.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!block.interactive?.filter || !filter) return true;
      return row.some((cell, index) => {
        const column = block.columns[index];
        return formatTableCell(cell, column?.format, block.currency)
          .toLocaleLowerCase('en-US')
          .includes(filter);
      });
    });

  const currentSort = sort;
  if (block.interactive?.sort && currentSort) {
    const direction = currentSort.direction === 'ascending' ? 1 : -1;
    rows.sort((a, b) => {
      const left = a.row[currentSort.column] ?? null;
      const right = b.row[currentSort.column] ?? null;
      if (left === null) return right === null ? a.index - b.index : 1;
      if (right === null) return -1;
      const compare =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : collator.compare(String(left), String(right));
      return compare === 0 ? a.index - b.index : compare * direction;
    });
  }
  return rows;
});

function toggleSort(column: number): void {
  if (sort?.column !== column) {
    sort = { column, direction: 'ascending' };
  } else {
    sort = {
      column,
      direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
    };
  }
}
</script>

<div
  data-py-block="table"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
>
{#if block.interactive?.filter}
  <div class="mb-2 flex flex-wrap items-center gap-2">
    <label class="grid w-full gap-1 text-xs text-muted-foreground sm:w-72">
      <span>Filter {block.caption}</span>
      <input
        type="search"
        class="min-h-touch rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={query}
        oninput={(event) => (query = event.currentTarget.value)}
      />
    </label>
    <p class="text-xs text-muted-foreground" role="status">
      {visibleRows.length} of {block.rows.length} rows
    </p>
  </div>
{/if}

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
            {#if block.interactive?.sort}
              <button
                type="button"
                class="inline-flex min-h-touch items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                aria-label="Sort by {column.label}"
                onclick={() => toggleSort(c)}
              >
                {column.label}
                <span aria-hidden="true">{sort?.column === c ? (sort.direction === 'ascending' ? '↑' : '↓') : '↕'}</span>
              </button>
            {:else}
              {column.label}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each visibleRows as entry (entry.index)}
        {@const row = entry.row}
        {@const r = entry.index}
        <tr
          class={cn(
            'border-b border-border last:border-0',
            block.highlightRow === r && 'bg-primary/10 font-semibold',
            block.interactive?.rowHighlight && 'hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring'
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
</div>
