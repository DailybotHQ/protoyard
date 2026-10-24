<script lang="ts">
/**
 * Thin re-export entry for kit-style tests and direct mounts.
 * Under the security-fuzz host, skip `@texuli/blocks/map` mounts (OOM risk).
 * Dynamic import keeps the map kit out of the fuzz module graph.
 */
import type { Block } from '@protoyard/blocks';
import { toTexuliMapBlock } from '../compat/map.ts';
import { isSecurityFuzzHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: Block } = $props();
const fuzzStub = $derived(isSecurityFuzzHost());
const mapBlock = $derived(block.type === 'map' ? block : null);
const ariaLabel = $derived(mapBlock ? (mapBlock.label ?? mapBlock.title ?? 'Map') : 'Map');
</script>

<div data-py-block="map" {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }} data-tx-blocks="map">
  {#if mapBlock}
    {#if fuzzStub}
      <div role="img" aria-label={ariaLabel}></div>
    {:else}
      {#await import('@texuli/blocks/map/renderers') then mod}
        <mod.MapBlockView block={toTexuliMapBlock(mapBlock)} />
      {:catch}
        <p class="text-sm text-muted-foreground" role="note">
          The simulated map could not be loaded.
        </p>
      {/await}
    {/if}
  {/if}
</div>
