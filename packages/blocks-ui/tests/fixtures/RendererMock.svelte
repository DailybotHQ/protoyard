<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { getBlockHost } from '../../src/host.ts';

let { block }: { block: Block } = $props();
const host = getBlockHost();
</script>

<article
  data-testid="rendered-block"
  data-block-type={block.type}
  data-density={host.density}
  data-canvas-mode={host.canvasMode}
  data-step={host.step ?? ''}
>
  {block.type}
</article>
