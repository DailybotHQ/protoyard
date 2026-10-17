<script lang="ts">
import { useEnvironment, usePrincipal } from '@protoyard/renderer-svelte';
import Notice from './Notice.svelte';

const environment = useEnvironment();
const principal = usePrincipal();

const env = $derived(environment.current);
const viewer = $derived(principal.current?.role === 'viewer');
</script>

{#if env.network === 'offline'}
  <Notice tone="warning" icon="offline" title="You're offline (simulated)">
    Balances are from your last sync. Transfers and payee changes won't be sent until you're back
    online.
  </Notice>
{:else if env.network === 'slow'}
  <Notice tone="info" title="Slow connection (simulated)">
    Actions may take a few seconds to confirm.
  </Notice>
{/if}
{#if env.failureMode !== 'none'}
  <Notice tone="danger" icon="warning" title="Lumen Bank is having trouble (simulated)">
    Some actions may fail. Nothing is charged twice — failed actions write nothing.
  </Notice>
{/if}
{#if viewer}
  <Notice title="View-only access">
    You can see balances and activity. Moving money and managing payees needs the primary holder.
  </Notice>
{/if}
