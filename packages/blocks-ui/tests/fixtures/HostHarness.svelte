<script lang="ts">
import type { Component } from 'svelte';
import { setBlockHost } from '../../src/host.ts';

/** Renders one block component under a host whose `step` follows the prop (as a deck does). */
let {
  component,
  block,
  step,
}: { component: Component<{ block: never }>; block: unknown; step?: number } = $props();

const host = $state<{ step?: number }>({});
$effect.pre(() => {
  host.step = step;
});
setBlockHost(host);

const Block = $derived(component);
</script>

<Block block={block as never} />
