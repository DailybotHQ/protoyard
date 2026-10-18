<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { MobileAppShell } from '@protoyard/ui';
import type { Component } from 'svelte';
import type { BankDatabase } from '../src/database/schema.ts';
import { provideBank } from '../src/lib/context.ts';
import { provideShellLayout } from '../src/lib/shell-layout.svelte.ts';

/** Renders one screen with the same contexts App.svelte provides (shell + bank). */
let {
  runtime,
  screen: Screen,
  query = '',
}: {
  runtime: PrototypeRuntime<BankDatabase>;
  // biome-ignore lint/suspicious/noExplicitAny: screens take route props.
  screen: Component<any>;
  query?: string;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime as PrototypeRuntime);
// svelte-ignore state_referenced_locally
provideBank(runtime);
// svelte-ignore state_referenced_locally
const shellLayout = provideShellLayout();
</script>

<MobileAppShell mainId="main" class="h-[640px]">
  {#snippet stickyFooter()}
    {#if shellLayout.footer}
      <div class="border-t border-border bg-background px-4 py-3" data-shell-sticky-footer>
        {@render shellLayout.footer()}
      </div>
    {/if}
  {/snippet}
  <Screen params={{}} query={new URLSearchParams(query)} path="/" />
</MobileAppShell>
