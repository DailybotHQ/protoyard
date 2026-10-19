<script lang="ts">
import type { LayoutProps } from '../../src/layouts/registry.ts';

let { mountScreen }: LayoutProps = $props();
let target: HTMLElement | undefined = $state();

$effect(() => {
  if (target) mountScreen(target);
});
</script>

<div data-test-layout="sidebar"><main bind:this={target}></main></div>
