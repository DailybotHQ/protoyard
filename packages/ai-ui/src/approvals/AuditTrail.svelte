<script lang="ts">
import { type AuditEntry, sortAudit } from '@protoyard/ai';
import { EmptyState } from 'texuli/empty';
import { useMessages } from 'texuli/i18n';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'texuli/table';
import { auditActionLabel } from './labels.ts';

/**
 * Newest-first audit table for suggestion decisions, on Texuli's table and
 * empty state. Pure presentation of engine AuditEntry rows.
 */
// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const messages = useMessages();
const A = 'protoyard.ai.audit-trail';

let {
  entries,
  emptyTitle,
  emptyDescription,
  actorName = (entry: AuditEntry) =>
    entry.actor === 'agent'
      ? messages('protoyard.ai.audit-trail.agent', 'Simulated agent')
      : (entry.actorId ?? messages('protoyard.ai.audit-trail.person', 'Person')),
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

<section class="grid gap-3 {className}" data-py-audit-trail aria-label={messages(`${A}.label`, 'Approval audit trail')}>
  <p class="m-0 text-xs text-muted-foreground">
    {messages(`${A}.note`, 'Simulated audit log. Not a compliance or security record.')}
  </p>
  {#if rows.length === 0}
    <EmptyState
      title={emptyTitle ?? messages(`${A}.empty-title`, 'No audit entries yet')}
      description={emptyDescription ??
        messages(
          `${A}.empty-description`,
          'When the simulated agent suggests something and people decide, rows appear here.'
        )}
      size="sm"
    />
  {:else}
    <Table density="compact" stack="sm" aria-label={messages(`${A}.entries`, 'Approval audit entries')}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{messages(`${A}.when`, 'When')}</TableHead>
          <TableHead scope="col">{messages(`${A}.who`, 'Who')}</TableHead>
          <TableHead scope="col">{messages(`${A}.what`, 'What')}</TableHead>
          <TableHead scope="col">{messages(`${A}.detail`, 'Detail')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each rows as entry (entry.id)}
          <TableRow data-py-audit-row={entry.id} data-action={entry.action}>
            <TableCell class="whitespace-nowrap text-muted-foreground">
              <time datetime={entry.at}>{formatWhen(entry.at)}</time>
            </TableCell>
            <TableCell>{actorName(entry)}</TableCell>
            <TableCell>{auditActionLabel(entry.action, messages)}</TableCell>
            <TableCell class="text-muted-foreground">{entry.detail}</TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  {/if}
</section>
