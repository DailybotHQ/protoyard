<script lang="ts">
import type { Blueprint } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime, type RouteDefinition } from '@protoyard/renderer-svelte';
import { Toaster } from '@protoyard/ui';
import type { Component } from 'svelte';
import { BlueprintApp, type RecordHref, type ThemeLibraryLoader } from '../../src/app/index.ts';

let {
  runtime,
  blueprint,
  themeLibrary,
  home,
  extraRoutes,
  recordHref,
  customActions = false,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  themeLibrary?: ThemeLibraryLoader;
  // biome-ignore lint/suspicious/noExplicitAny: test screens.
  home?: Component<any>;
  extraRoutes?: RouteDefinition[];
  recordHref?: RecordHref;
  customActions?: boolean;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);
</script>

{#if customActions}
  <BlueprintApp {blueprint} {themeLibrary} {home} {extraRoutes} {recordHref}>
    {#snippet actions()}
      <button type="button">Custom action</button>
    {/snippet}
  </BlueprintApp>
{:else}
  <BlueprintApp {blueprint} {themeLibrary} {home} {extraRoutes} {recordHref} />
{/if}
<Toaster />
