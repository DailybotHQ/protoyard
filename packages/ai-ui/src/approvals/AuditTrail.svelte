<script lang="ts">
import { type AuditEntry, sortAudit } from '@protoyard/ai';
import { EmptyState } from 'texuli/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'texuli/table';
import { AUDIT_ACTION_LABELS } from './labels.ts';

/**
 * Newest-first audit table for suggestion decisions, on Texuli's table and
 * empty state. Pure presentation of engine AuditEntry rows.
 */
let {
  entries,
  emptyTitle = 'No audit entries yet',
  emptyDescription = 'When the simulated agent suggests something and people decide, rows appear here.',
  actorName = (entry: AuditEntry) =>
    entry.actor === 'agent' ? 'Simulated agent' : (entry.actorId ?? 'Person'),
  formatWhen = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  },
  class: className = '',
}: {
  entries: readonly AuditEntry[];
  emptyTitle?: string;
  emptyDescription?: string;
  actorName?: (entry: AuditEntry) => string;
  formatWhen?: (iso: string) => string;
  class?: string;
} = $props();

const rows = $derived(sortAudit(entries));
</script>

<section class="grid gap-3 {className}" data-py-audit-trail aria-label="Approval audit trail">
  <p class="m-0 text-xs text-muted-foreground">
    Simulated audit log. Not a compliance or security record.
  </p>
  {#if rows.length === 0}
    <EmptyState title={emptyTitle} description={emptyDescription} size="sm" />
  {:else}
    <Table density="compact" stack="sm" aria-label="Approval audit entries">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">When</TableHead>
          <TableHead scope="col">Who</TableHead>
          <TableHead scope="col">What</TableHead>
          <TableHead scope="col">Detail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each rows as entry (entry.id)}
          <TableRow data-py-audit-row={entry.id} data-action={entry.action}>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              <time datetime={entry.at}>{formatWhen(entry.at)}</time>
            </TableCell>
            <TableCell>{actorName(entry)}</TableCell>
            <TableCell>{AUDIT_ACTION_LABELS[entry.action]}</TableCell>
            <TableCell class="text-muted-foreground">{entry.detail}</TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  {/if}
</section>
