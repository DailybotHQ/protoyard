<script lang="ts">
import type { Snippet } from 'svelte';

let { children, onready }: { children: Snippet; onready: (node: HTMLDivElement) => void } =
  $props();
let outlet: HTMLDivElement | undefined = $state();

$effect(() => {
  if (outlet) onready(outlet);
});
</script>

<div bind:this={outlet} data-py-layout-screen>{@render children()}</div>
