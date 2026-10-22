<script lang="ts">
import type { Block } from '@protoyard/blocks';
import MapBlockView from './MapBlockView.svelte';

let { block }: { block: Block } = $props();
</script>

{#if block.type === 'map'}
  <MapBlockView {block} />
{:else}
  <p class="text-sm text-muted-foreground" role="note">This map block is not available.</p>
{/if}
