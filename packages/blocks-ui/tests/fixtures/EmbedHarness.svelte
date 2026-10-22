<script lang="ts">
import { untrack } from 'svelte';
import BlockRenderer from '../../src/BlockRenderer.svelte';
import { type MountEmbed, setBlockHost } from '../../src/host.ts';

interface Props {
  blocks: readonly unknown[];
  mountEmbed?: MountEmbed;
}

let { blocks, mountEmbed }: Props = $props();

// Host is fixed for the test mount; untrack avoids the "initial value only" warning.
const options = untrack(() =>
  mountEmbed
    ? { density: 'comfortable' as const, canvasMode: 'slide' as const, mountEmbed }
    : { density: 'comfortable' as const, canvasMode: 'slide' as const }
);
setBlockHost(options);
</script>

<BlockRenderer {blocks} />
