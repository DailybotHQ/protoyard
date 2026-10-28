<script lang="ts">
/**
 * Direct mount adapter: Texuli EmbedApp + Protoyard host mountEmbed / start labels.
 */
import type { Block } from '@protoyard/blocks';
import { DEFAULT_EMBED_BLOCK_LABELS } from '@texuli/blocks/embed';
import { EmbedApp as TexuliEmbedApp } from '@texuli/blocks/embed/renderers';
import { getBlockHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: Block } = $props();
const host = getBlockHost();

const labels = $derived({
  ...DEFAULT_EMBED_BLOCK_LABELS,
  ...(block.type === 'embed-app' && block.startLabel ? { start: block.startLabel } : {}),
});
</script>

<!-- data-py-embed-app: the block id a generated deck's embed host reads (templates/deck/src/embed-host.ts). -->
<div
  data-py-block="embed-app"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }}
  data-tx-blocks="embed"
  data-py-embed-app={block.type === 'embed-app' ? block.id : undefined}
>
  {#if block.type === 'embed-app'}
    <TexuliEmbedApp {block} mountEmbed={host.mountEmbed} {labels} />
  {/if}
</div>
