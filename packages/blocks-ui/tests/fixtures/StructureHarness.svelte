<script lang="ts">
import type { Block } from '@protoyard/blocks';
import type { BlockCtaAction } from '../../src/host.ts';
import { setBlockHost } from '../../src/host.ts';
import StructureFamily from '../../src/structure/StructureFamily.svelte';

let {
  block,
  onCtaAction,
  canvasMode = 'flow',
}: {
  block: Block;
  onCtaAction?: (action: BlockCtaAction) => void | Promise<void>;
  canvasMode?: 'flow' | 'slide';
} = $props();

// svelte-ignore state_referenced_locally -- host options are fixed for the harness mount.
setBlockHost({ canvasMode, onCtaAction });
</script>

<StructureFamily {block} />
