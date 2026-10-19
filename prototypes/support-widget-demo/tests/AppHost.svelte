<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import App from '../src/App.svelte';
import type { ChatDatabase } from '../src/database/schema.ts';

/** Renders the widget app with the runtime context mountPrototype would provide. */
let { runtime }: { runtime: PrototypeRuntime<ChatDatabase> } = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime as PrototypeRuntime);
</script>

<App />
