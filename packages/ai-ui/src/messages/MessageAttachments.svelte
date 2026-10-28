<script lang="ts">
import { FileText } from '@lucide/svelte';
import type { MessageAttachment } from '@protoyard/ai/messages';
import { Button } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { formatBytes, isImageMime, isInlineImageUrl } from './format.ts';
import { settle } from './types.ts';

/**
 * Attachments: images inline (local or `data:` only, as the contract allows),
 * other files as a labeled row. Opening a file is the host's job, through
 * `onOpen`; without it, files are listed but not interactive.
 */
let {
  attachments,
  onOpen,
}: {
  attachments: readonly MessageAttachment[];
  onOpen?: (attachment: MessageAttachment) => unknown | Promise<unknown>;
} = $props();

let pending = $state<string | null>(null);
let error = $state('');

async function open(attachment: MessageAttachment): Promise<void> {
  if (!onOpen || pending) return;
  pending = attachment.id;
  error = (await settle(() => onOpen(attachment))) ?? '';
  pending = null;
}
</script>

<ul class="m-0 grid list-none gap-2 p-0" data-py-message-attachments aria-label="Attachments">
  {#each attachments as attachment (attachment.id)}
    <li class="flex items-center gap-2 text-sm">
      {#if isImageMime(attachment.mime) && isInlineImageUrl(attachment.url)}
        <img class="max-h-40 max-w-60 rounded-md border border-border object-contain" src={attachment.url} alt={attachment.name} loading="lazy" />
      {:else}
        <LucideIcon icon={FileText} size="sm" class="shrink-0 text-muted-foreground" />
        {#if onOpen}
          <!-- One open at a time: pending is the component's own state, so autoLoading is off. -->
          <Button
            variant="link"
            autoLoading={false}
            loading={pending === attachment.id}
            disabled={pending !== null}
            onclick={() => open(attachment)}
          >
            {attachment.name}
          </Button>
        {:else}
          <span>{attachment.name}</span>
        {/if}
        <span class="text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
      {/if}
    </li>
  {/each}
</ul>
{#if error}
  <p class="m-0 text-xs text-destructive" role="alert">{error}</p>
{/if}
