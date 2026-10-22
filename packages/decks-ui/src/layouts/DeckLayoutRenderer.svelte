<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { stripStepMarkers } from '@protoyard/decks/layouts';
import type { CustomSlide } from '@protoyard/decks/schema';
import { loadLayoutRenderer } from './registry.ts';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
const load = $derived(loadLayoutRenderer(layout));
// Catalog props validate without their step markers (`step`, `fragment`,
// `reveal`); the slide step host reads the markers from the slide itself.
// Free slides keep theirs: a block's `step` is part of the block contract.
const content = $derived(layout === 'free' ? props : stripStepMarkers(props));
</script>

{#if layout === 'custom'}
  <!-- Thumbnails, print and previews never run a deck's own code: a labelled card instead. -->
  {#await import('./CustomSlideHost.svelte') then host}
    <host.default slide={{ id: 'custom', layout: 'custom', props } as CustomSlide} live={false} />
  {/await}
{:else}
{#await load}
  <div aria-label="Loading slide layout" class="grid h-full place-items-center" role="status">
    <span class="sr-only">Loading slide layout…</span>
  </div>
{:then Renderer}
  {#if Renderer}
    <Renderer {layout} props={content} />
  {:else}
    <p class="p-8 text-[24px] text-foreground" role="note">This slide layout is not available.</p>
  {/if}
{:catch}
  <p class="p-8 text-[24px] text-foreground" role="note">This slide layout could not be loaded.</p>
{/await}
{/if}
