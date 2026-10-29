<script lang="ts">
import type { OutboxItem } from '@protoyard/flows';
import { WorkflowViewer } from '@texuli/workflows/viewer';
import { flowStepRegistry, graphForLabels } from '../editor/workflow-graph.ts';

let { items = [] }: { items?: readonly OutboxItem[] } = $props();
const outboxGraph = $derived(
  graphForLabels(items.map((item) => `${item.kind}${item.channel ? ` · ${item.channel}` : ''}`))
);
</script>

<section class="grid gap-3 rounded-xl border border-border bg-card p-4 text-foreground sm:p-6" aria-labelledby="flow-outbox-heading">
  <header class="grid gap-1">
    <h2 id="flow-outbox-heading" class="m-0 text-lg font-semibold">Outbox preview</h2>
    <p class="m-0 text-sm text-muted-foreground">Simulated deliveries are recorded here; nothing is sent.</p>
  </header>
  {#if items.length === 0}
    <p class="m-0 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">The outbox is empty.</p>
  {:else}
    <WorkflowViewer graph={outboxGraph} registry={flowStepRegistry} label="Simulated delivery sequence" />
    <ol class="m-0 grid gap-2 p-0" aria-label="Simulated outbox items">
      {#each items as item (item.id)}
        <li class="list-none rounded-lg border border-border bg-background p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong class="text-sm capitalize">{item.kind}</strong><time class="text-xs text-muted-foreground" datetime={item.at}>{item.at}</time>
          </div>
          <p class="my-2 whitespace-pre-wrap text-sm">{item.text || '(No preview text)'}</p>
          {#if item.to?.length}<p class="m-0 text-xs text-muted-foreground">To: {item.to.join(', ')}</p>{/if}
          {#if item.channel}<p class="m-0 text-xs text-muted-foreground">Channel: {item.channel}</p>{/if}
          {#if item.subject}<p class="m-0 text-xs text-muted-foreground">Subject: {item.subject}</p>{/if}
          {#if item.url}<p class="m-0 break-all text-xs text-muted-foreground">Masked URL: <code>{item.url}</code></p>{/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>
