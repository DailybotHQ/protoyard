<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { untrack } from 'svelte';
import App from '../../src/App.svelte';

/** The whole Lattice app on the real runtime, as `mountPrototype` renders it. */
let { runtime }: { runtime: PrototypeRuntime } = $props();
provideRuntime(untrack(() => runtime));
</script>

<App />
