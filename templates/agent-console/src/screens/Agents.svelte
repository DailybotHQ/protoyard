<script lang="ts">
import { Bot, Wrench } from '@lucide/svelte';
import { can, getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Separator, Skeleton } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import AgentDialog from '../components/AgentDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import type { ConsoleDatabase } from '../database/schema.ts';
import { modelFor } from '../domain/agents.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { percent, timeAgo } from '../lib/format.ts';

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const agents = liveQuery(() => runtime.db.agents.orderBy('updatedAt').reverse().toArray(), {
  initial: [],
});
const runs = liveQuery(() => runtime.db.runs.toArray(), { initial: [] });
const evaluations = liveQuery(() => runtime.db.evaluations.orderBy('createdAt').toArray(), {
  initial: [],
});

let dialogOpen = $state(false);
const canCreate = $derived(can(CAPABILITIES.agentsCreate));

const statsFor = (agentId: string) => {
  const mine = (runs.current ?? []).filter(
    (r) => r.agentId === agentId && r.source === 'playground'
  );
  const latest = (evaluations.current ?? []).filter((e) => e.agentId === agentId).at(-1);
  return {
    runs: mine.length,
    lastRun: mine
      .map((r) => r.createdAt)
      .sort()
      .at(-1),
    latest,
  };
};
</script>

<PageHeader title="Agents" description="Define instructions, tools and a simulated model, then try them in the playground.">
  {#snippet actions()}
    {#if canCreate}
      <Button onclick={() => (dialogOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />New agent</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if agents.loading}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading agents">
    {#each [0, 1, 2] as i (i)}<Skeleton class="h-44" />{/each}
  </div>
{:else if (agents.current?.length ?? 0) === 0}
  <EmptyState
    icon={Bot}
    title="No agents yet"
    description={canCreate
      ? 'Create an agent: give it instructions, enable simulated tools and run it in the playground.'
      : 'Nobody has defined an agent yet. Your role can read agents but not create them.'}
  >
    {#snippet action()}
      {#if canCreate}<Button onclick={() => (dialogOpen = true)}><Icon icon="plus" class="size-4" aria-hidden="true" />Create an agent</Button>{/if}
    {/snippet}
  </EmptyState>
{:else}
  <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each agents.current ?? [] as agent (agent.id)}
      {@const stats = statsFor(agent.id)}
      <li class="flex">
        <Card href={`#/agents/${encodeURIComponent(agent.id)}`} linkLabel={agent.name} class="w-full p-4">
        <div class="flex items-start gap-3">
          <Box surface="muted" radius="lg" padding="none" class="grid size-9 shrink-0 place-items-center" aria-hidden="true"><LucideIcon icon={Bot} tone="primary" class="size-4" /></Box>
          <div class="min-w-0">
            <Heading level={2} size="sm">{agent.name}</Heading>
            <Text size="xs" tone="muted">{modelFor(agent.modelId).name}</Text>
          </div>
        </div>
        <Text size="sm" tone="muted" lineClamp={2} class="mt-3">{agent.description || agent.instructions}</Text>
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each agent.tools as tool (tool)}
            <Badge variant="outline"><LucideIcon icon={Wrench} />{tool}{agent.approvalTools.includes(tool) ? ' · approval' : ''}</Badge>
          {:else}
            <Badge variant="secondary">No tools</Badge>
          {/each}
        </div>
        <div class="mt-auto pt-3"><Separator /></div>
        <dl class="grid grid-cols-3 gap-2 pt-3">
          <div><dt><Text as="span" size="xs" tone="muted">Runs</Text></dt><dd><Text as="span" size="xs" weight="medium">{stats.runs}</Text></dd></div>
          <div>
            <dt><Text as="span" size="xs" tone="muted">Last eval</Text></dt>
            <dd><Text as="span" size="xs" weight="medium">{stats.latest ? percent(stats.latest.passed, stats.latest.passed + stats.latest.failed) : '—'}</Text></dd>
          </div>
          <div><dt><Text as="span" size="xs" tone="muted">Last run</Text></dt><dd><Text as="span" size="xs" weight="medium">{stats.lastRun ? timeAgo(stats.lastRun, clock.now) : '—'}</Text></dd></div>
        </dl>
        </Card>
      </li>
    {/each}
  </ul>
{/if}

<AgentDialog bind:open={dialogOpen} />
