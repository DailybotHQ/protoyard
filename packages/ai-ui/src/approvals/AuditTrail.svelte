<script lang="ts">
import { type AuditEntry, sortAudit } from '@protoyard/ai';
import { AUDIT_ACTION_LABELS } from './labels.ts';

/**
 * Newest-first audit table for suggestion decisions. Pure presentation of
 * engine AuditEntry rows.
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
    <div class="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p class="m-0 font-medium text-foreground">{emptyTitle}</p>
      <p class="mt-1 m-0 text-sm text-muted-foreground">{emptyDescription}</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-border text-muted-foreground">
            <th scope="col" class="px-2 py-2 font-semibold">When</th>
            <th scope="col" class="px-2 py-2 font-semibold">Who</th>
            <th scope="col" class="px-2 py-2 font-semibold">What</th>
            <th scope="col" class="px-2 py-2 font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as entry (entry.id)}
            <tr class="border-b border-border" data-py-audit-row={entry.id} data-action={entry.action}>
              <td class="px-2 py-2 whitespace-nowrap text-muted-foreground">
                <time datetime={entry.at}>{formatWhen(entry.at)}</time>
              </td>
              <td class="px-2 py-2 text-foreground">{actorName(entry)}</td>
              <td class="px-2 py-2 text-foreground">{AUDIT_ACTION_LABELS[entry.action]}</td>
              <td class="px-2 py-2 text-muted-foreground">{entry.detail}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
