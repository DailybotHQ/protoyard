<script lang="ts">
import { useEnvironment, usePrincipal } from '@protoyard/renderer-svelte';
import Notice from './Notice.svelte';

// Simulated conditions people must understand before acting.
const environment = useEnvironment();
const principal = usePrincipal();

const env = $derived(environment.current);
const viewer = $derived(principal.current?.role === 'viewer');
</script>

{#if env.network === 'offline'}
  <Notice tone="warning" icon="offline" title="You're offline (simulated)">
    You can browse what's on this device. Changes won't save until you're back online.
  </Notice>
{:else if env.network === 'slow'}
  <Notice title="Slow connection (simulated)">Saving may take a few seconds.</Notice>
{/if}
{#if env.failureMode !== 'none'}
  <Notice tone="danger" icon="warning" title="The server is having trouble (simulated)">
    Some changes may fail. Failed changes are never half-saved.
  </Notice>
{/if}
{#if viewer}
  <Notice title="Read-only access">You can look around, but only the owner can make changes.</Notice>
{/if}
