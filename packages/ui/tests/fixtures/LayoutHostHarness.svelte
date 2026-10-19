<script lang="ts">
import type { LayoutId } from '@protoyard/core';
import LayoutHost from '../../src/layouts/LayoutHost.svelte';
import CounterScreen from './CounterScreen.svelte';

let { layout }: { layout: LayoutId } = $props();
</script>

<LayoutHost {layout}>
  {#snippet children()}
    <CounterScreen />
  {/snippet}
</LayoutHost>
