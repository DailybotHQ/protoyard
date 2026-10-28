<script lang="ts">
import { Pin } from '@lucide/svelte';
import { Button, EmptyState } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Document } from '../database/schema.ts';
import { fromNow, preview } from '../lib/format.ts';

/** The middle pane: documents in the current scope, already filtered and sorted. */
let {
  documents,
  activeId,
  now,
  emptyTitle,
  emptyDescription,
  onopen,
}: {
  documents: Document[];
  activeId: string | null;
  now: Date;
  emptyTitle: string;
  emptyDescription: string;
  onopen: (id: string) => void;
} = $props();
</script>

{#if documents.length === 0}
  <EmptyState size="sm" title={emptyTitle} description={emptyDescription} class="m-3" />
{:else}
  <ul class="divide-y divide-border" aria-label="Documents" data-testid="document-list">
    {#each documents as doc (doc.id)}
      <li>
        <Button
          type="button"
          class="block w-full px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset aria-[current=true]:bg-primary/10"
          aria-current={doc.id === activeId ? 'true' : undefined}
          onclick={() => onopen(doc.id)}
        >
          <span class="flex items-center gap-1.5">
            {#if doc.pinned}<LucideIcon icon={Pin} class="size-3.5 shrink-0 text-primary" label="Pinned" />{/if}
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{fromNow(doc.updatedAt, now)}</span>
          </span>
          <span class="mt-0.5 block truncate text-xs text-muted-foreground">{preview(doc.body) || 'No text yet'}</span>
        </Button>
      </li>
    {/each}
  </ul>
{/if}
