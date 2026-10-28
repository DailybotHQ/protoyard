<script lang="ts">
import { CloudAlert, WifiOff } from '@lucide/svelte';
import { useEnvironment } from '@protoyard/renderer-svelte';
import { LucideIcon } from 'texuli/icons/lucide';

/** Simulated network / outage conditions, so failures never look like bugs. */
const environment = useEnvironment();
const env = $derived(environment.current);
</script>

{#if env.network === 'offline'}
  <div role="status" class="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm">
    <LucideIcon icon={WifiOff} class="size-4 shrink-0" />
    <span><span class="font-medium">You are offline.</span> Messages can't be sent (simulated).</span>
  </div>
{:else if env.failureMode !== 'none' && env.failureRate > 0}
  <div role="status" class="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
    <LucideIcon icon={CloudAlert} class="size-4 shrink-0" />
    <span>
      <span class="font-medium">{env.failureScope.includes('assistant.') ? 'The assistant is having trouble.' : 'Service problems.'}</span>
      Some requests will fail (simulated {env.failureMode}).
    </span>
  </div>
{/if}
