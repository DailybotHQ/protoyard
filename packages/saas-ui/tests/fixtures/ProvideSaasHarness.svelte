<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { onMount } from 'svelte';
import { getSaas, provideSaas } from '../../src/context.ts';

/** Minimal runtime stub: only what provideSaas stores. */
const runtime = {
  prototypeId: 'example.saas-ui-harness',
} as unknown as PrototypeRuntime;

provideSaas(runtime, { homePath: '/', signInPath: '/sign-in' });

let home = $state('');
let signIn = $state('');

onMount(() => {
  const ctx = getSaas();
  home = ctx.config.homePath;
  signIn = ctx.config.signInPath;
});
</script>

<p data-testid="saas-home">{home}</p>
<p data-testid="saas-sign-in">{signIn}</p>
