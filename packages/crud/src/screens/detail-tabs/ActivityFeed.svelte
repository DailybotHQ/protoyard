<script lang="ts">
import type { AuditEntry } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';

let { entries, runtime }: { entries: AuditEntry[]; runtime: PrototypeRuntime } = $props();
const people = $derived(
  new Map(runtime.members.list().map(({ persona }) => [persona.id, persona.name]))
);
const actionLabel = (action: AuditEntry['action']) =>
  ({
    create: 'created',
    update: 'updated',
    delete: 'deleted',
    restore: 'restored',
    purge: 'removed',
    import: 'imported',
  })[action];
</script>

{#if entries.length === 0}
  <p class="text-sm text-muted-foreground">No activity yet.</p>
{:else}
  <ol class="grid gap-3" aria-label="Activity feed">
    {#each entries as entry (entry.id)}
      <li class="rounded-lg border border-border p-4">
        <p class="m-0 text-sm">
          <span class="font-medium">{people.get(entry.actorId) ?? 'A team member'}</span>
          {' '}{actionLabel(entry.action)} this record
          <time class="ml-2 text-muted-foreground" datetime={entry.at}>{entry.at}</time>
        </p>
      </li>
    {/each}
  </ol>
{/if}
