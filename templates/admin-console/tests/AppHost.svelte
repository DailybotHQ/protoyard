<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { untrack } from 'svelte';
import App from '../src/App.svelte';

/** Mounts the real App on a real runtime (what mountPrototype does, minus the shell). */
let { runtime }: { runtime: PrototypeRuntime } = $props();
provideRuntime(untrack(() => runtime));
</script>

<App />
