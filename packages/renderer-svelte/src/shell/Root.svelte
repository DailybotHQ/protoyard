<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { Toaster } from '@protoyard/ui';
import type { Component } from 'svelte';
import { provideRuntime } from '../context.ts';
import DemoBadge from './DemoBadge.svelte';
import LoadProgressBar from './LoadProgressBar.svelte';
import PendingLinkPrompt from './PendingLinkPrompt.svelte';
import ShellHost from './ShellHost.svelte';
import StorageBanner from './StorageBanner.svelte';

let {
  runtime,
  App,
  demoBadge = false,
}: {
  runtime: PrototypeRuntime;
  // biome-ignore lint/suspicious/noExplicitAny: prototype apps may declare optional props.
  App: Component<any>;
  demoBadge?: boolean;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);
// svelte-ignore state_referenced_locally
const storage = runtime.storage();
</script>

{#if !storage.persistent}
  <StorageBanner {storage} />
{/if}
<LoadProgressBar {runtime} />
<PendingLinkPrompt {runtime} />
<!-- Toasts sit inside the shell's screen, so they appear on the device. -->
<ShellHost {runtime}>
  <!-- Scroll root: `display: contents` normally; the scrolling region under viewport presets and in shells (app.css). -->
  <div data-py-scroll-root>
    <App />
  </div>
  <Toaster />
</ShellHost>
<!-- Outside the screen: below the stage in a frame, a free corner when full-bleed (app.css). -->
{#if demoBadge}
  <DemoBadge name={runtime.manifest.name} />
{/if}
