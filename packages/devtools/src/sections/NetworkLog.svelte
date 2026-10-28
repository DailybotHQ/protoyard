<script lang="ts">
import { ChevronRight } from '@lucide/svelte';
import {
  getMockApis,
  type MockApi,
  type NetworkLogEntry,
  subscribeMockApis,
} from '@protoyard/http';
import { formatDateTime } from '../format.ts';
import Btn from '../primitives/Btn.svelte';
import Glyph from '../primitives/Glyph.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

/** Requests handled by this prototype's mock APIs (`@protoyard/http`), newest first. */
let { dt }: { dt: DevtoolsState } = $props();

// svelte-ignore state_referenced_locally
let apis = $state.raw<readonly MockApi[]>(getMockApis(dt.runtime));
let entries = $state.raw<{ api: string; entry: NetworkLogEntry }[]>([]);
let expanded = $state<string | null>(null);

$effect(() => subscribeMockApis(dt.runtime, (next) => (apis = next)));
$effect(() => {
  const read = () => {
    entries = apis
      .flatMap((api) => api.log.entries().map((entry) => ({ api: api.baseUrl, entry })))
      .sort((a, b) => b.entry.at.localeCompare(a.entry.at) || b.entry.id - a.entry.id);
  };
  read();
  const offs = apis.map((api) => api.log.subscribe(read));
  return () => {
    for (const off of offs) off();
  };
});

function chip(status: number | null): { label: string; cls: string } {
  if (status === null) return { label: 'offline', cls: 'bg-muted text-muted-foreground' };
  if (status < 300) return { label: String(status), cls: 'bg-success text-success-foreground' };
  if (status < 500) return { label: String(status), cls: 'bg-warning text-warning-foreground' };
  return { label: String(status), cls: 'bg-destructive text-destructive-foreground' };
}
</script>

<Section title="Mock API requests" description="Simulated HTTP from @protoyard/http. Set failure scope “http.” to fail only these.">
  {#snippet actions()}
    {#if entries.length > 0}
      <Btn variant="ghost" onclick={() => apis.forEach((api) => api.log.clear())}>Clear</Btn>
    {/if}
  {/snippet}
  {#if apis.length === 0}
    <p class="text-[11px] text-muted-foreground">This prototype has no mock API (createMockApi).</p>
  {:else if entries.length === 0}
    <p class="text-[11px] text-muted-foreground">No mock API requests yet.</p>
  {:else}
    <ul class="divide-y divide-border overflow-hidden rounded-md border border-border" aria-label="Mock API requests">
      {#each entries as { api, entry } (`${api}#${entry.id}`)}
        {@const key = `${api}#${entry.id}`}
        {@const c = chip(entry.status)}
        <li>
          <Btn
            type="button"
            class="flex min-h-touch w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:min-h-7"
            aria-expanded={expanded === key}
            onclick={() => (expanded = expanded === key ? null : key)}
          >
            <Glyph icon="chevron-right" class={['size-3 shrink-0 transition-transform motion-reduce:transition-none', expanded === key && 'rotate-90']} aria-hidden="true" />
            <span class="w-10 shrink-0 font-mono font-semibold">{entry.method}</span>
            <span class="min-w-0 flex-1 truncate font-mono" title={entry.url}>{entry.url}</span>
            <span class="shrink-0 rounded px-1 font-mono text-[10px] font-medium {c.cls}">{c.label}</span>
            <span class="w-12 shrink-0 text-right font-mono text-muted-foreground tabular-nums">{Math.round(entry.durationMs)} ms</span>
          </Btn>
          {#if expanded === key}
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 bg-muted/40 px-3 py-2 text-[11px]">
              <dt class="text-muted-foreground">Route</dt>
              <dd class="font-mono">{entry.route ?? 'no match'}</dd>
              <dt class="text-muted-foreground">At</dt>
              <dd class="font-mono">{formatDateTime(entry.at)}</dd>
              {#if entry.error}
                <dt class="text-muted-foreground">Error</dt>
                <dd class="text-destructive">{entry.error}</dd>
              {/if}
              {#if entry.requestBody}
                <dt class="text-muted-foreground">Request</dt>
                <dd><pre class="max-h-32 overflow-auto font-mono text-[10px] whitespace-pre-wrap break-all">{entry.requestBody}</pre></dd>
              {/if}
              {#if entry.responseBody}
                <dt class="text-muted-foreground">Response</dt>
                <dd><pre class="max-h-32 overflow-auto font-mono text-[10px] whitespace-pre-wrap break-all">{entry.responseBody}</pre></dd>
              {/if}
            </dl>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Section>
