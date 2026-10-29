<script lang="ts">
/**
 * Text family: Texuli TextBlockView for heading/text/list/quote/callout.
 * Divider is structure in Texuli — routed through StructureFamily.
 * Extension: none in this family beyond field-shape mapping in compat/text.
 */
import type { Block } from '@protoyard/blocks';
import { StructureFamily } from '@texuli/blocks/structure/renderers';
import { TextBlockView } from '@texuli/blocks/text/renderers';
import { toTexuliStructureBlock } from '../compat/structure.ts';
import { isTexuliTextType, toTexuliTextBlock } from '../compat/text.ts';

let { block }: { block: Block } = $props();
</script>

<div data-py-block-family="text" data-tx-blocks="text">
  {#if block.type === 'divider'}
    <StructureFamily block={toTexuliStructureBlock(block)} />
  {:else if isTexuliTextType(block.type)}
    <TextBlockView block={toTexuliTextBlock(block)} />
  {:else}
    <p class="text-sm text-muted-foreground" role="note">This text block could not be shown.</p>
  {/if}
</div>
