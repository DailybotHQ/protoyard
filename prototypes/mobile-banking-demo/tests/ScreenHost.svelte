<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import type { Component } from 'svelte';
import type { BankDatabase } from '../src/database/schema.ts';
import { provideBank } from '../src/lib/context.ts';

/** Renders one screen with the same contexts App.svelte provides. */
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
</script>

<Screen params={{}} query={new URLSearchParams(query)} path="/" />
