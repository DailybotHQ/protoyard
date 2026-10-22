<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import { loadLayoutRenderer } from './registry.ts';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
const load = $derived(loadLayoutRenderer(layout));
</script>

{#await load}
  <div aria-label="Loading slide layout" class="grid h-full place-items-center" role="status">
    <span class="sr-only">Loading slide layout…</span>
  </div>
{:then Renderer}
  {#if Renderer}
    <Renderer {layout} {props} />
  {:else}
    <p class="p-8 text-[24px] text-foreground" role="note">This slide layout is not available.</p>
  {/if}
{:catch}
  <p class="p-8 text-[24px] text-foreground" role="note">This slide layout could not be loaded.</p>
{/await}
