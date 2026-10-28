<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { untrack } from 'svelte';
import { provideShop } from '../src/lib/context.ts';
import Checkout from '../src/screens/Checkout.svelte';

let { runtime }: { runtime: PrototypeRuntime } = $props();
untrack(() => {
  provideRuntime(runtime);
  provideShop();
});
</script>

<Checkout />
