<script lang="ts">
import type { FlowRunResult } from '@protoyard/flows';

let { result }: { result: FlowRunResult | null } = $props();
</script>

<section class="grid gap-3 rounded-xl border border-border bg-card p-4 text-foreground sm:p-6" aria-labelledby="flow-keeps-heading">
  <header class="grid gap-1">
    <h2 id="flow-keeps-heading" class="m-0 text-lg font-semibold">Keeps</h2>
    <p class="m-0 text-sm text-muted-foreground">Records and list changes proposed by the latest simulated run.</p>
  </header>
  {#if !result}
    <p class="m-0 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Keeps will appear after a test run.</p>
  {:else if result.keeps.records.length === 0 && Object.keys(result.keeps.lists).length === 0}
    <p class="m-0 text-sm text-muted-foreground">This run produced no keeps.</p>
  {:else}
    {#if result.keeps.records.length}
      <ul class="m-0 grid gap-2 p-0" aria-label="Kept records">
        {#each result.keeps.records as record (record.id)}
          <li class="list-none rounded-lg border border-border bg-background p-3">
            <h3 class="m-0 text-sm font-semibold">{record.title}</h3>
            <p class="m-0 text-xs text-muted-foreground">{record.collection} · {record.state ?? 'No state'}</p>
            {#if Object.keys(record.fields).length}
              <dl class="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {#each Object.entries(record.fields) as [key, value] (key)}<div><dt class="text-muted-foreground">{key}</dt><dd class="m-0">{value}</dd></div>{/each}
              </dl>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if Object.keys(result.keeps.lists).length}
      <h3 class="m-0 text-sm font-semibold">Lists</h3>
      <ul class="m-0 grid gap-2 p-0" aria-label="Kept lists">
        {#each Object.entries(result.keeps.lists) as [id, list] (id)}
          <li class="list-none rounded-lg border border-border bg-background p-3">
            <span class="font-medium">{id}</span><span class="text-muted-foreground">: {list.items.join(', ') || 'No items'}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
