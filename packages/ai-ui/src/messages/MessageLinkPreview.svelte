<script lang="ts">
import { ExternalLink } from '@lucide/svelte';
import type { LinkPreviewBlock } from '@protoyard/ai/messages';
import { hostOf, isInlineImageUrl } from './format.ts';

/**
 * A link card. The page is never fetched: title, description and image come
 * from the message, and the image is local or inline (the contract refuses
 * remote images). The link opens in a new tab without access to this page.
 */
let { block }: { block: LinkPreviewBlock } = $props();

const site = $derived(block.siteName ?? hostOf(block.url));
</script>

<a
  class="flex max-w-md gap-3 rounded-lg border border-border bg-elevated p-3 text-sm no-underline hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  data-py-message-block="link_preview"
  href={block.url}
  target="_blank"
  rel="noopener noreferrer"
>
  {#if block.image && isInlineImageUrl(block.image)}
    <img class="size-16 shrink-0 rounded-md border border-border object-cover" src={block.image} alt="" loading="lazy" />
  {/if}
  <span class="grid min-w-0 gap-0.5">
    <span class="flex items-center gap-1 text-xs text-muted-foreground">
      {site}
      <ExternalLink class="size-3" aria-hidden="true" />
      <span class="sr-only">(opens in a new tab)</span>
    </span>
    <span class="truncate font-medium text-foreground">{block.title ?? block.url}</span>
    {#if block.description}
      <span class="line-clamp-2 text-muted-foreground">{block.description}</span>
    {/if}
  </span>
</a>
