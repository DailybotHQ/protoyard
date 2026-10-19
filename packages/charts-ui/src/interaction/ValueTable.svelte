<script lang="ts">
/**
 * The tabular alternative for charts whose data is not x/y series (slices,
 * funnel steps, flows). Cells arrive formatted; the first column is the row
 * header. Loaded on demand behind a TableToggle.
 */
let {
  caption,
  headers,
  rows,
}: {
  caption: string;
  /** Column headers; the first names the row-header column. */
  headers: readonly string[];
  /** One entry per row: an id and its cells (first cell = row header). */
  rows: readonly { id: string; cells: readonly string[] }[];
} = $props();
</script>

<div class="max-h-80 overflow-auto rounded-lg border border-border">
  <table class="w-full border-collapse text-left text-xs">
    <caption class="sr-only">{caption}</caption>
    <thead class="sticky top-0 bg-surface">
      <tr>
        {#each headers as header, k (k)}
          <th scope="col" class="border-b border-border px-2 py-1.5 font-medium {k > 0 ? 'text-right' : ''}">{header}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr class="odd:bg-muted/40">
          {#each row.cells as cell, k (k)}
            {#if k === 0}
              <th scope="row" class="px-2 py-1 font-normal">{cell}</th>
            {:else}
              <td class="px-2 py-1 text-right tabular-nums">{cell}</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
