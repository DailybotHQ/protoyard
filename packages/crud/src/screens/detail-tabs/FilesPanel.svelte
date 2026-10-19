<script lang="ts">
import type { Row } from '@protoyard/core';

let { attachments }: { attachments: Row[] } = $props();
</script>

{#if attachments.length === 0}
  <p class="text-sm text-muted-foreground">No attachments.</p>
{:else}
  <ul class="divide-y rounded-lg border border-border" aria-label="Files">
    {#each attachments as file (String(file.id))}
      <li class="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
        <span>{String(file.name ?? file.id)}</span>
        <span class="text-muted-foreground">{typeof file.size === 'number' ? `${Math.ceil(file.size / 1024)} KB` : ''}</span>
      </li>
    {/each}
  </ul>
{/if}
