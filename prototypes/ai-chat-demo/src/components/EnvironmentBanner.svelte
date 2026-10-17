<script lang="ts">
import { CloudAlert, WifiOff } from '@lucide/svelte';
import { useEnvironment } from '@protoyard/renderer-svelte';

/** Simulated network / outage conditions, so failures never look like bugs. */
const environment = useEnvironment();

const env = $derived(environment.current);
const offline = $derived(env.network === 'offline');
const outage = $derived(env.failureMode !== 'none' && env.failureRate > 0);
const agentsOnly = $derived(
  env.failureScope.length > 0 && env.failureScope.every((s) => s.startsWith('agents'))
);
</script>

{#if offline}
  <div role="status" class="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm text-foreground">
    <WifiOff class="size-4 shrink-0" aria-hidden="true" />
    <span><span class="font-medium">You are offline.</span> Messages can't be sent until the connection returns (simulated).</span>
  </div>
{:else if outage}
  <div role="status" class="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground">
    <CloudAlert class="size-4 shrink-0" aria-hidden="true" />
    <span>
      <span class="font-medium">{agentsOnly ? 'Agents are having trouble.' : 'Service problems.'}</span>
      {agentsOnly ? 'Replies may fail — you can retry each one.' : 'Some actions may fail.'} (simulated {env.failureMode})
    </span>
  </div>
{:else if env.network === 'slow'}
  <div role="status" class="border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">
    Slow connection — replies take longer (simulated).
  </div>
{/if}
