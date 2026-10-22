<script lang="ts">
import BlockRenderer from '../../src/BlockRenderer.svelte';
import { setBlockHost } from '../../src/host.ts';

let { blocks }: { blocks: readonly unknown[] } = $props();
setBlockHost({ density: 'spacious', canvasMode: 'slide', step: 2 });
</script>

<BlockRenderer {blocks} />
