<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import App from '../src/App.svelte';
import type { AppDatabase } from '../src/database/schema.ts';

/** Renders the whole App with the runtime context mountPrototype provides. */
let { runtime }: { runtime: PrototypeRuntime<AppDatabase> } = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime as PrototypeRuntime);
</script>

<App />
