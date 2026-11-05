<script lang="ts">
import type { TableBlock } from '@protoyard/ai/messages';
import { useMessages } from 'texuli/i18n';
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
// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const t = useMessages();
const M = 'protoyard.ai.message';
const yesNo = $derived({ yes: t(`${M}.yes`, 'Yes'), no: t(`${M}.no`, 'No') });
</script>

<div class="max-w-full" data-py-message-block="table">
  <Table class="tabular-nums" label={block.title ?? t(`${M}.table`, 'Table')}>
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
            <TableCell align={column.align}>{formatCell(Object.hasOwn(row, column.key) ? row[column.key] : null, yesNo)}</TableCell>
          {/each}
        </TableRow>
      {:else}
        <TableRow>
          <TableCell class="text-muted-foreground" colspan={block.columns.length}>{t(`${M}.no-rows`, 'No rows.')}</TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
</div>
