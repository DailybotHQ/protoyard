<script lang="ts">
/**
 * Embed family: Texuli EmbedBlockView. Start labels and mountEmbed from host.
 */
import type { Block } from '@protoyard/blocks';
import { EmbedBlockView } from '@texuli/blocks/embed/renderers';
import { getBlockHost } from '../host.ts';

let { block }: { block: Block } = $props();
const host = getBlockHost();

const labels = $derived(
  block.type === 'embed-app' && block.startLabel ? { start: block.startLabel } : undefined
);
</script>

<div data-py-block-family="embed" data-tx-blocks="embed">
  <EmbedBlockView {block} mountEmbed={host.mountEmbed} {labels} />
</div>
