<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { createBilling } from '@protoyard/saas';
import { provideSaas } from '@protoyard/saas-ui';
import { type Component, untrack } from 'svelte';
import { LATTICE_PLANS } from '../../src/domain/plans.ts';
import { LATTICE_SAAS_UI } from '../../src/saas.ts';

/**
 * One screen on the real runtime inside the same kit context App.svelte
 * provides (`provideSaas(runtime, { billing, ...LATTICE_SAAS_UI })`).
 */
let {
  runtime,
  view: Screen,
  viewProps = {},
}: {
  runtime: PrototypeRuntime;
  // biome-ignore lint/suspicious/noExplicitAny: route screens take arbitrary props.
  view: Component<any>;
  viewProps?: Record<string, unknown>;
} = $props();

const initial = untrack(() => runtime);
provideRuntime(initial);
provideSaas(initial, { billing: createBilling(initial, LATTICE_PLANS), ...LATTICE_SAAS_UI });
</script>

<Screen {...viewProps} />
