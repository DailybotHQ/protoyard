<script lang="ts">
/**
 * Adapter: Protoyard diagram family → `@texuli/blocks/diagram` DiagramFamily.
 * Validates again inside Texuli; Protoyard Zod already ran at the registry.
 */
import type { Block } from '@protoyard/blocks';
import TexuliDiagram from '@texuli/blocks/diagram/renderers';

let { block }: { block: Block } = $props();
</script>

<div data-py-block-family="diagram" data-tx-blocks="diagram">
  <TexuliDiagram {block} />
</div>
