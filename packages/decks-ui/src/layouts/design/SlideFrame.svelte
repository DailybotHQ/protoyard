<script lang="ts">
import type { Snippet } from 'svelte';

/**
 * The root of every designed slide. It is an inline-size container, so the
 * type scale in `scale.ts` follows the stage width, and it clips at the stage
 * edge: content fits through line clamps and `fit.ts`, never by spilling out.
 * Backgrounds stay transparent so deck themes and background presets show.
 */
let {
  layout,
  class: className = '',
  children,
}: { layout: string; class?: string; children: Snippet } = $props();
</script>

<!-- The unpadded wrapper is the size container, so 1cqw is 1 % of the stage width. -->
<div class="deck-slide-stage @container size-full min-w-0">
  <section
    data-py-deck-layout={layout}
    data-py-deck-design={layout}
    class={`deck-slide relative flex h-full w-full min-w-0 flex-col overflow-hidden text-foreground ${className}`}
  >
    {@render children()}
  </section>
</div>

<style>
  /* Shared block content keeps the deck text minimums (24 px body, 18 px labels). */
  .deck-slide :global([data-slot='blocks'] p),
  .deck-slide :global([data-slot='blocks'] li),
  .deck-slide :global([data-slot='blocks'] blockquote),
  .deck-slide :global([data-slot='blocks'] td),
  .deck-slide :global([data-slot='blocks'] th) {
    font-size: max(24px, 1em);
    line-height: 1.35;
  }
  .deck-slide :global([data-slot='blocks'] small),
  .deck-slide :global([data-slot='blocks'] caption),
  .deck-slide :global([data-slot='blocks'] figcaption),
  .deck-slide :global([data-slot='blocks'] label),
  .deck-slide :global([data-slot='blocks'] button),
  .deck-slide :global([data-slot='blocks'] [role='tab']),
  .deck-slide :global([data-slot='blocks'] [role='button']) {
    font-size: max(18px, 0.75em);
  }
  .deck-slide :global(svg text) {
    font-size: max(18px, 1em);
  }
  /* Media fills its slot and crops instead of shrinking into a thumbnail. */
  .deck-slide :global([data-slot='media'] figure) {
    margin: 0;
    height: 100%;
  }
  .deck-slide :global([data-slot='media'] img),
  .deck-slide :global([data-slot='media'] video) {
    display: block;
    width: 100%;
    height: 100%;
    max-width: none;
    border: 0;
    border-radius: 0;
    object-fit: cover;
  }
  .deck-slide :global([data-slot='media'][data-fit='contain'] img),
  .deck-slide :global([data-slot='media'][data-fit='contain'] video) {
    object-fit: contain;
  }
  /* The data table stays behind the chart's own toggle on screen; print shows it. */
  .deck-slide :global([data-slot='print-table']) {
    display: none;
  }
  @media print {
    .deck-slide :global([data-slot='print-table']) {
      display: block;
    }
  }
</style>
