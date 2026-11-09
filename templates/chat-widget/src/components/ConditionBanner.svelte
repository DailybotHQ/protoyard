<script lang="ts">
import { CloudAlert, WifiOff } from '@lucide/svelte';
import { useEnvironment } from '@protoyard/renderer-svelte';
import { Notice } from '@protoyard/ui';

/** Simulated network / outage conditions, so failures never look like bugs. */
const environment = useEnvironment();
const env = $derived(environment.current);
</script>

{#if env.network === 'offline'}
  <Notice tone="warning" icon={WifiOff} title="You are offline." text="Messages can't be sent (simulated)." class="mx-3 mt-2" />
{:else if env.failureMode !== 'none' && env.failureRate > 0}
  <Notice
    tone="warning"
    icon={CloudAlert}
    title={env.failureScope.includes('assistant.') ? 'The assistant is having trouble.' : 'Service problems.'}
    text={`Some requests will fail (simulated ${env.failureMode}).`}
    class="mx-3 mt-2"
  />
{/if}
