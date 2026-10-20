<script lang="ts">
import type { Blueprint } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { Toaster } from '@protoyard/ui';
import { BlueprintApp, type ThemeLibraryLoader } from '../../src/app/index.ts';

let {
  runtime,
  blueprint,
  themeLibrary,
}: { runtime: PrototypeRuntime; blueprint: Blueprint; themeLibrary?: ThemeLibraryLoader } =
  $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);
</script>

<BlueprintApp {blueprint} {themeLibrary} />
<Toaster />
