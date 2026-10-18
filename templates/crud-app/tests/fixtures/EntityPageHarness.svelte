<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { provideCrudApp } from '../../src/lib/context.ts';
import EntityPage from '../../src/screens/EntityPage.svelte';

let { runtime, entityName }: { runtime: PrototypeRuntime; entityName: string } = $props();
// svelte-ignore state_referenced_locally
provideRuntime(runtime);
// svelte-ignore state_referenced_locally
provideCrudApp(runtime);
</script>

<EntityPage {entityName} params={{}} query={new URLSearchParams()} />
