<script lang="ts">
import type { TableBlock } from '@protoyard/ai/messages';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'texuli/table';
import { formatCell } from './format.ts';

/**
 * A data table on Texuli's `Table`: caption, column headers, aligned cells.
 * When it overflows, Texuli's scroll area becomes a focusable region named by
 * the title (WCAG 2.1.1), so wide tables stay reachable by keyboard.
 */
let { block }: { block: TableBlock } = $props();
</script>

<div class="max-w-full" data-py-message-block="table">
  <Table class="tabular-nums" label={block.title ?? 'Table'}>
    {#if block.title}
      <TableCaption>{block.title}</TableCaption>
    {/if}
    <TableHeader>
      <TableRow>
        {#each block.columns as column (column.key)}
          <TableHead scope="col" align={column.align}>{column.header}</TableHead>
        {/each}
      </TableRow>
    </TableHeader>
    <TableBody>
      {#each block.rows as row, index (index)}
        <TableRow>
          {#each block.columns as column (column.key)}
            <TableCell align={column.align}>{formatCell(Object.hasOwn(row, column.key) ? row[column.key] : null)}</TableCell>
          {/each}
        </TableRow>
      {:else}
        <TableRow>
          <TableCell class="text-muted-foreground" colspan={block.columns.length}>No rows.</TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>
