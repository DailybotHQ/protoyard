<script lang="ts">
/**
 * Adapter: Protoyard diagram family → `@texuli/blocks/diagram` DiagramFamily.
 * Validates again inside Texuli; Protoyard Zod already ran at the registry.
 * A tree's `style` (Protoyard's blueprint field) reaches Texuli as `variant`.
 */
import type { Block } from '@protoyard/blocks';
import { toTexuliDiagram } from '@protoyard/blocks/diagram';
import TexuliDiagram from '@texuli/blocks/diagram/renderers';

let { block }: { block: Block } = $props();
const texuliBlock = $derived(toTexuliDiagram(block));
</script>

<div data-py-block-family="diagram" data-tx-blocks="diagram">
  <TexuliDiagram block={texuliBlock} />
</div>
