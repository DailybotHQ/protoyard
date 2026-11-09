<script lang="ts">
import { FlaskConical } from '@lucide/svelte';
import { can, getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { ListItem } from 'texuli/list-item';
import { Text } from 'texuli/typography';
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
      <Button onclick={() => (dialogOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New dataset</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if datasets.loading}
  <Skeleton class="h-40" />
{:else if (datasets.current?.length ?? 0) === 0}
  <EmptyState
    icon={FlaskConical}
    title="No datasets yet"
    description={hasAgents
      ? 'Create a dataset of prompts and expected outcomes, then run it against an agent.'
      : 'Create an agent first; datasets evaluate one agent.'}
  />
{:else}
  <Card class="p-2">
    <ul>
      {#each datasets.current ?? [] as dataset (dataset.id)}
        {@const latest = latestFor(dataset.id)}
        <ListItem href={`#/datasets/${dataset.id}`} title={dataset.name} description={`${agentName(dataset.agentId)} · ${dataset.cases.length} case${dataset.cases.length === 1 ? '' : 's'}`}>
          {#snippet trailing()}
            {#if latest}
              <div class="text-right">
                <Badge variant={latest.failed === 0 ? 'success' : 'warning'}>{percent(latest.passed, latest.passed + latest.failed)} passed</Badge>
                <Text size="xs" tone="muted" class="mt-1">{latest.passed}/{latest.passed + latest.failed} · {timeAgo(latest.createdAt, clock.now)}</Text>
              </div>
            {:else}
              <Badge variant="secondary">Not run yet</Badge>
            {/if}
          {/snippet}
        </ListItem>
      {/each}
    </ul>
  </Card>
{/if}

<DatasetDialog bind:open={dialogOpen} />
