<script lang="ts">
import { type AuditEntry, type Blueprint, fieldLabel, inputProperty } from '@protoyard/blueprint';
import { Card } from '@protoyard/ui';

let { entries, blueprint }: { entries: AuditEntry[]; blueprint: Blueprint } = $props();

function changedValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function changeLabel(entry: AuditEntry, name: string): string {
  const field = blueprint.entities
    .find((candidate) => candidate.name === entry.entity)
    ?.fields.find((candidate) => inputProperty(candidate) === name);
  return field ? fieldLabel(field) : name;
}
</script>

{#if entries.length === 0}
  <p class="text-sm text-muted-foreground">No history yet.</p>
{:else}
  <ol class="grid gap-3" aria-label="Change history">
    {#each entries as entry (entry.id)}
      <li><Card class="p-4">
        <p class="text-sm font-medium">
          {entry.action} <time class="font-normal text-muted-foreground" datetime={entry.at}>{entry.at}</time>
        </p>
        {#if Object.keys(entry.changes).length > 0}
          <ul class="mt-2 grid gap-1 text-sm">
            {#each Object.entries(entry.changes) as [name, change] (name)}
              <li><span class="font-medium">{changeLabel(entry, name)}:</span> {changedValue(change.before)} → {changedValue(change.after)}</li>
            {/each}
          </ul>
        {/if}
      </Card></li>
    {/each}
  </ol>
{/if}
