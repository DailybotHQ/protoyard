<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import App from '../src/App.svelte';
import type { CourseLmsDatabase } from '../src/database/schema.ts';

let { runtime }: { runtime: PrototypeRuntime<CourseLmsDatabase> } = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime as PrototypeRuntime);
</script>

<App />
