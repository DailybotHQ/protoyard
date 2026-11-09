<script lang="ts">
import { Pin } from '@lucide/svelte';
import { Button, EmptyState } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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
  <ul aria-label="Documents" data-testid="document-list">
    {#each documents as doc, index (doc.id)}
      <li>
        <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="p-1">
          <Button
            type="button"
            variant={doc.id === activeId ? 'secondary' : 'ghost'}
            class="flex h-auto w-full flex-col items-stretch justify-start whitespace-normal px-2 py-1.5 text-left"
            aria-current={doc.id === activeId ? 'true' : undefined}
            onclick={() => onopen(doc.id)}
          >
            <span class="flex items-center gap-1.5">
              {#if doc.pinned}<LucideIcon icon={Pin} tone="primary" class="size-3.5 shrink-0" label="Pinned" />{/if}
              <Text as="span" size="sm" weight="medium" truncate class="min-w-0 flex-1">{doc.title}</Text>
              <Text as="span" size="xs" tone="muted" class="shrink-0">{fromNow(doc.updatedAt, now)}</Text>
            </span>
            <Text as="span" size="xs" tone="muted" truncate class="mt-0.5 block">{preview(doc.body) || 'No text yet'}</Text>
          </Button>
        </Box>
      </li>
    {/each}
  </ul>
{/if}
