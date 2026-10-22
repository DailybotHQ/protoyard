<script lang="ts">
import type { Block } from '@protoyard/blocks';

/**
 * Nested child blocks inside tabs/reveal. Dynamically imports the root
 * dispatcher so this family chunk can finish loading without a cycle through
 * the registry (registry → interactive → NestedBlocks → registry).
 */
let { blocks }: { blocks: readonly Block[] } = $props();
</script>

{#if blocks.length === 0}
  <p class="text-sm text-muted-foreground" role="note">This panel is empty.</p>
{:else}
  {#await import('../BlockRenderer.svelte') then mod}
    <mod.default {blocks} />
  {:catch}
    <p class="text-sm text-muted-foreground" role="note">Nested blocks could not be displayed.</p>
  {/await}
{/if}
