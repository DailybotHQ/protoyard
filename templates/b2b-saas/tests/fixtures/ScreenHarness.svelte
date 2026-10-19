<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { type Component, untrack } from 'svelte';

/** One template screen on the real runtime, as `mountPrototype` provides it. */
let {
  runtime,
  view: Screen,
}: {
  runtime: PrototypeRuntime;
  // biome-ignore lint/suspicious/noExplicitAny: route screens take arbitrary props.
  view: Component<any>;
} = $props();
provideRuntime(untrack(() => runtime));
</script>

<Screen />
