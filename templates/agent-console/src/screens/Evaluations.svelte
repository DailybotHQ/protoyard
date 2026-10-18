<script lang="ts">
import { FlaskConical, Plus } from '@lucide/svelte';
import { can, getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState, Skeleton } from '@protoyard/ui';
import DatasetDialog from '../components/DatasetDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { ConsoleDatabase } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { percent, timeAgo } from '../lib/format.ts';

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const datasets = liveQuery(() => runtime.db.datasets.orderBy('updatedAt').reverse().toArray(), {
  initial: [],
});
const agents = liveQuery(() => runtime.db.agents.toArray(), { initial: [] });
const evaluations = liveQuery(() => runtime.db.evaluations.orderBy('createdAt').toArray(), {
  initial: [],
});

let dialogOpen = $state(false);
const canWrite = $derived(can(CAPABILITIES.datasetsWrite));
const hasAgents = $derived((agents.current?.length ?? 0) > 0);
const agentName = (id: string) =>
  (agents.current ?? []).find((a) => a.id === id)?.name ?? 'Deleted agent';
const latestFor = (datasetId: string) =>
  (evaluations.current ?? []).filter((e) => e.datasetId === datasetId).at(-1);
</script>

<PageHeader title="Evaluations" description="Datasets of prompts with expected tools or text. Runs are simulated and deterministic.">
  {#snippet actions()}
    {#if canWrite && hasAgents}
      <Button onclick={() => (dialogOpen = true)}><Plus class="size-4" aria-hidden="true" />New dataset</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if datasets.loading}
  <Skeleton class="h-40 rounded-xl" />
{:else if (datasets.current?.length ?? 0) === 0}
  <EmptyState
    icon={FlaskConical}
    title="No datasets yet"
    description={hasAgents
      ? 'Create a dataset of prompts and expected outcomes, then run it against an agent.'
      : 'Create an agent first; datasets evaluate one agent.'}
  />
{:else}
  <ul class="divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
    {#each datasets.current ?? [] as dataset (dataset.id)}
      {@const latest = latestFor(dataset.id)}
      <li class="relative flex flex-wrap items-center gap-4 p-4 hover:bg-muted/40">
        <div class="min-w-0 flex-1">
          <a href={`#/datasets/${dataset.id}`} class="font-medium after:absolute after:inset-0 focus-visible:outline-none">{dataset.name}</a>
          <p class="text-sm text-muted-foreground">{agentName(dataset.agentId)} · {dataset.cases.length} case{dataset.cases.length === 1 ? '' : 's'}</p>
        </div>
        {#if latest}
          <div class="text-right text-sm">
            <Badge variant={latest.failed === 0 ? 'success' : 'warning'}>{percent(latest.passed, latest.passed + latest.failed)} passed</Badge>
            <p class="mt-1 text-xs text-muted-foreground">{latest.passed}/{latest.passed + latest.failed} · {timeAgo(latest.createdAt, clock.now)}</p>
          </div>
        {:else}
          <Badge variant="secondary">Not run yet</Badge>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<DatasetDialog bind:open={dialogOpen} />
