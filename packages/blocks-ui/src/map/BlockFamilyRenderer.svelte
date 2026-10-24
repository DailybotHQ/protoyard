<script lang="ts">
/** Map family: Texuli MapBlockView with tone/shape adapter. */
import type { Block } from '@protoyard/blocks';
import { MapBlockView } from '@texuli/blocks/map/renderers';
import { toTexuliMapBlock } from '../compat/map.ts';

let { block }: { block: Block } = $props();
</script>

<div data-py-block-family="map" data-tx-blocks="map">
  {#if block.type === 'map'}
    <MapBlockView block={toTexuliMapBlock(block)} />
  {:else}
    <p class="text-sm text-muted-foreground" role="note">This map block could not be shown.</p>
  {/if}
</div>
