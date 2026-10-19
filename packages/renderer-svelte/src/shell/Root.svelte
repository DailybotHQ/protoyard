<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { Toaster } from '@protoyard/ui';
import type { Component } from 'svelte';
import { usePending } from '../bindings.svelte.ts';
import { provideRuntime } from '../context.ts';
import DemoBadge from './DemoBadge.svelte';
import PendingIndicator from './PendingIndicator.svelte';
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
// svelte-ignore state_referenced_locally
const pending = usePending(runtime);
</script>

{#if !storage.persistent}
  <StorageBanner {storage} />
{/if}
<PendingLinkPrompt {runtime} />
<!-- Toasts, the badge and the pending bar sit inside the shell's screen, so they appear on the device. -->
<ShellHost {runtime}>
  <!-- Global pending feedback for every runtime operation (no prototype code needed). -->
  <PendingIndicator {runtime} />
  <!-- Scroll root: `display: contents` normally; the scrolling region under viewport presets and in shells (app.css). -->
  <div data-py-scroll-root aria-busy={pending.active || undefined}>
    <App />
  </div>
  <Toaster />
  {#if demoBadge}
    <DemoBadge name={runtime.manifest.name} />
  {/if}
</ShellHost>
