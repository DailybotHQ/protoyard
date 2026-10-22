<script lang="ts">
import type { BlockStateHost } from '@protoyard/blocks/interactive';
import { BlockRenderer, setBlockHost } from '../../src/index.ts';

let {
  blocks,
  stateHost,
  documentId = 'preview',
  viewerId = 'viewer',
}: {
  blocks: readonly unknown[];
  stateHost?: BlockStateHost;
  documentId?: string;
  viewerId?: string;
} = $props();

setBlockHost({
  stateHost,
  documentId,
  viewerId,
  density: 'comfortable',
  canvasMode: 'flow',
});
</script>

<BlockRenderer {blocks} />
