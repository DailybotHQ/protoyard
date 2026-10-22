<script lang="ts">
import type { TableBlock as TableBlockData } from '@protoyard/blocks';
import { formatTableCell } from './format.ts';
import TableView from './TableView.svelte';

/**
 * Opt-in sorting and filtering for a table block, local to this mounted view.
 * Its own chunk: only tables with `interactive.sort` or `interactive.filter`
 * load it (the blocks data family stays inside its budget).
 */
let { block }: { block: TableBlockData } = $props();

const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });
let query = $state('');
let sort = $state<{ column: number; direction: 'ascending' | 'descending' } | null>(null);

const visibleRows = $derived.by(() => {
  const filter = query.trim().toLocaleLowerCase('en-US');
  const rows = block.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!block.interactive?.filter || !filter) return true;
      return row.some((cell, index) =>
        formatTableCell(cell, block.columns[index]?.format, block.currency)
          .toLocaleLowerCase('en-US')
          .includes(filter)
      );
    });
  const current = sort;
  if (block.interactive?.sort && current) {
    const direction = current.direction === 'ascending' ? 1 : -1;
    rows.sort((a, b) => {
      const left = a.row[current.column] ?? null;
      const right = b.row[current.column] ?? null;
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
  sort =
    sort?.column === column
      ? { column, direction: sort.direction === 'ascending' ? 'descending' : 'ascending' }
      : { column, direction: 'ascending' };
}
</script>

{#if block.interactive?.filter}
  <div class="mb-2 flex flex-wrap items-center gap-2">
    <label class="grid w-full gap-1 text-xs text-muted-foreground sm:max-w-xs">
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
<TableView {block} rows={visibleRows} {sort} onsort={block.interactive?.sort ? toggleSort : undefined} />
