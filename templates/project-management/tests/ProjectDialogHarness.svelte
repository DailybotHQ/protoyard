<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { untrack } from 'svelte';
import ProjectDialog from '../src/components/ProjectDialog.svelte';
import { provideWorkspace } from '../src/lib/context.svelte.ts';

let { runtime }: { runtime: PrototypeRuntime } = $props();
untrack(() => {
  provideRuntime(runtime);
  provideWorkspace();
});
let open = $state(true);
</script>

<ProjectDialog bind:open />
