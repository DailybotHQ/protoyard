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

<!-- `data-py-embed-app` carries the block id, which a prototype's embed host reads for the app's storage namespace. -->
<div
  data-py-block="embed-app"
  data-py-embed-app={block.type === 'embed-app' ? block.id : undefined}
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }}
  data-tx-blocks="embed"
>
  {#if block.type === 'embed-app'}
    <TexuliEmbedApp {block} mountEmbed={host.mountEmbed} {labels} />
  {/if}
</div>
