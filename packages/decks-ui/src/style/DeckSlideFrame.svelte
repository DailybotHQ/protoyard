<script lang="ts">
import type { DeckBackground } from '@protoyard/decks';
import type { Snippet } from 'svelte';
import DeckMediaBackground from '../canvas/DeckMediaBackground.svelte';
import { getDeckStyleContext } from './deck-style.svelte.ts';

/**
 * One slide's surface: its background (the slide's own preset, else the
 * deck's), the text tokens that keep it readable, and the deck's logo,
 * footer and slide number. Used by the canvas, overview thumbnails and print
 * pages, so every view shows the same slide.
 */
let {
  background,
  mediaPreload = 'none',
  number,
  children,
}: {
  /** A preset id, a media spec, or an unknown slug from an older deck (renders the default). */
  background?: DeckBackground | string | undefined;
  /** Canvas media: load the active and next slide, keep all other instances unloaded. */
  mediaPreload?: 'auto' | 'none';
  /** 1-based position among visible slides; shown when the deck asks for slide numbers. */
  number?: number;
  children: Snippet;
} = $props();

const context = getDeckStyleContext();
const surface = $derived(context?.state.surface(background, context.deckBackground) ?? null);
const look = $derived(context?.state.resolution ?? null);
const showNumber = $derived(Boolean(look?.slideNumbers && number !== undefined));
const showFooter = $derived(Boolean(look && (look.footer || look.logo || showNumber)));
</script>

<div
  class="deck-slide-frame relative size-full overflow-hidden"
  data-py-deck-frame
  data-py-deck-background={surface?.preset ?? (surface ? surface.kind : undefined)}
  data-py-deck-tone={surface?.tone}
  data-py-deck-inverse={surface?.inverse ? 'true' : undefined}
  style={surface?.style}
>
  {#if surface?.media}
    <DeckMediaBackground media={surface.media} overlay={surface.overlay} preload={mediaPreload} />
  {/if}
  <div class="relative z-[1] size-full">
  {@render children()}
  </div>
  {#if showFooter && look}
    <!-- Bottom-left, so the deck's own chrome (progress, toolbar) never covers the number. -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 px-16 pb-6 text-base text-muted-foreground"
      data-py-deck-footer
    >
      {#if showNumber}
        <span class="shrink-0 font-semibold tabular-nums text-foreground" data-py-deck-slide-number-mark>{number}</span>
      {/if}
      {#if look.logo}
        <img src={look.logo} alt="" class="h-8 w-auto max-w-40 object-contain" data-py-deck-logo />
      {/if}
      {#if look.footer}
        <span class="min-w-0 truncate" data-py-deck-footer-text>{look.footer}</span>
      {/if}
    </div>
  {/if}
</div>
