<script lang="ts">
/**
 * Embed family: Texuli EmbedBlockView. Start labels and mountEmbed from host.
 */
import type { Block } from '@protoyard/blocks';
import { EmbedBlockView } from '@texuli/blocks/embed/renderers';
import { getBlockHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

let { block }: { block: Block } = $props();
const host = getBlockHost();

const labels = $derived(
  block.type === 'embed-app' && block.startLabel ? { start: block.startLabel } : undefined
);
</script>

<!--
  `data-py-block` is the block root every Protoyard block carries (decks find
  interactive blocks by it, doc reading styles key on it); deck navigation
  leaves the embed's own keys and clicks alone. `data-py-embed-app` carries the
  block id: a prototype's embed host (`mountEmbed`) reads it to give each
  embedded app its own storage namespace.
-->
<div
  data-py-block-family="embed"
  data-py-block={block.type}
  data-py-embed-app={block.type === 'embed-app' ? block.id : undefined}
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: true }}
  data-tx-blocks="embed"
>
  <EmbedBlockView {block} mountEmbed={host.mountEmbed} {labels} />
</div>
