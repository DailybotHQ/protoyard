<script lang="ts">
/** Map family: Texuli MapBlockView with tone/shape adapter. */
import type { Block } from '@protoyard/blocks';
import { MapBlockView } from '@texuli/blocks/map/renderers';
import { toTexuliMapBlock } from '../compat/map.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: Block } = $props();
</script>

<!--
  `data-py-block` is the block root every Protoyard block carries; the deck
  mark keeps arrow keys and drags on the map (pan, zoom) from changing slides.
-->
<div
  data-py-block-family="map"
  data-py-block="map"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }}
  data-tx-blocks="map"
>
  {#if block.type === 'map'}
    <MapBlockView block={toTexuliMapBlock(block)} />
  {:else}
    <p class="text-sm text-muted-foreground" role="note">This map block could not be shown.</p>
  {/if}
</div>
