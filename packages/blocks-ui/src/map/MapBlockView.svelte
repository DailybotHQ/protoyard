<script lang="ts">
/** Thin re-export entry for kit-style tests and direct mounts. */
import type { Block } from '@protoyard/blocks';
import { MapBlockView as TexuliMap } from '@texuli/blocks/map/renderers';
import { toTexuliMapBlock } from '../compat/map.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: Block } = $props();
</script>

<div data-py-block="map" {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }} data-tx-blocks="map">
  {#if block.type === 'map'}
    <TexuliMap block={toTexuliMapBlock(block)} />
  {/if}
</div>
