<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { untrack } from 'svelte';
import { provideSaas } from '../../src/context.ts';
import InviteAccept from '../../src/screens/invites/Accept.svelte';

/** The accept screen in the kit context, as the `/invites/accept` route renders it. */
let { runtime }: { runtime: PrototypeRuntime } = $props();
provideSaas(untrack(() => runtime));
</script>

<InviteAccept />
