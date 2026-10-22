<script lang="ts">
import type { TableBlock as TableBlockData } from '@protoyard/blocks';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import TableView from './TableView.svelte';

/**
 * A data table block. A plain table renders at once; a table with sorting or
 * filtering shows the same table while its controls load on their own chunk
 * (`InteractiveTable.svelte`), so nothing moves when they arrive.
 */
let { block }: { block: TableBlockData } = $props();

const allRows = $derived(block.rows.map((row, index) => ({ row, index })));
const explorable = $derived(block.interactive?.sort === true || block.interactive?.filter === true);
/** Only an interactive table (sort, filter or row highlight) keeps a click from advancing a deck. */
const deckInteractive = $derived(
  block.interactive === undefined ? {} : { [DECK_INTERACTIVE_ATTRIBUTE]: '' }
);
</script>

<div data-py-block="table" {...deckInteractive}>
  {#if explorable}
    {#await import('./InteractiveTable.svelte')}
      <TableView {block} rows={allRows} />
    {:then module}
      <module.default {block} />
    {:catch}
      <TableView {block} rows={allRows} />
    {/await}
  {:else}
    <TableView {block} rows={allRows} />
  {/if}
</div>
