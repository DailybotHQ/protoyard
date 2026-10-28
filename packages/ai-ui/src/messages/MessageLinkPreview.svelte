<script lang="ts">
import { ExternalLink } from '@lucide/svelte';
import type { LinkPreviewBlock } from '@protoyard/ai/messages';
import { Card } from 'texuli/card';
import { LucideIcon } from 'texuli/icons/lucide';
import { hostOf, isInlineImageUrl } from './format.ts';

/**
 * A link card (Texuli's clickable `Card`). The page is never fetched: title,
 * description and image come from the message, and the image is local or
 * inline (the contract refuses remote images). The URL also goes through
 * Texuli's URL policy at the untrusted tier; the link opens in a new tab
 * without access to this page.
 */
let { block }: { block: LinkPreviewBlock } = $props();

const site = $derived(block.siteName ?? hostOf(block.url));
// Card renders an <a> for `href` but types its props as HTMLAttributes, so the
// anchor-only attributes travel in a spread.
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
</script>

<Card
  class="flex max-w-md flex-row gap-3 p-3 text-sm no-underline"
  data-py-message-block="link_preview"
  href={block.url}
  hrefTrust="untrusted"
  {...NEW_TAB}
>
  {#if block.image && isInlineImageUrl(block.image)}
    <img class="size-16 shrink-0 rounded-md border border-border object-cover" src={block.image} alt="" loading="lazy" />
  {/if}
  <span class="grid min-w-0 gap-0.5">
    <span class="flex items-center gap-1 text-xs text-muted-foreground">
      {site}
      <LucideIcon icon={ExternalLink} size="xs" />
      <span class="sr-only">(opens in a new tab)</span>
    </span>
    <span class="truncate font-medium text-foreground">{block.title ?? block.url}</span>
    {#if block.description}
      <span class="line-clamp-2 text-muted-foreground">{block.description}</span>
    {/if}
  </span>
</Card>
