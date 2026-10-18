<script lang="ts">
import type { BlueprintNotificationService } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime } from '@protoyard/renderer-svelte';
import { Toaster } from '@protoyard/ui';
import MembersScreen from '../../src/MembersScreen.svelte';
import NotificationsBell from '../../src/NotificationsBell.svelte';

let {
  runtime,
  mode = 'both',
  notifications,
}: {
  runtime: PrototypeRuntime;
  mode?: 'bell' | 'members' | 'both';
  notifications?: BlueprintNotificationService;
} = $props();

// svelte-ignore state_referenced_locally
provideRuntime(runtime);
</script>

<div data-testid="team-ui-harness">
  {#if mode === 'bell' || mode === 'both'}
    <NotificationsBell {runtime} service={notifications} />
  {/if}
  {#if mode === 'members' || mode === 'both'}
    <MembersScreen {runtime} />
  {/if}
</div>
<Toaster />
