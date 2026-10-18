<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import AppSearch from '../../src/components/AppSearch.svelte';
import { provideCrudApp } from '../../src/lib/context.ts';

let { runtime }: { runtime: PrototypeRuntime } = $props();
// svelte-ignore state_referenced_locally
provideRuntime(runtime);
// svelte-ignore state_referenced_locally
provideCrudApp(runtime);
</script>

<AppSearch />
