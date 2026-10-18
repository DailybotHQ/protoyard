<script lang="ts">
import { Bot, Plus, Wrench } from '@lucide/svelte';
import { can, getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState, Skeleton } from '@protoyard/ui';
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
      <Button onclick={() => (dialogOpen = true)}><Plus class="size-4" aria-hidden="true" />New agent</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if agents.loading}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading agents">
    {#each [0, 1, 2] as i (i)}<Skeleton class="h-44 rounded-xl" />{/each}
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
      {#if canCreate}<Button onclick={() => (dialogOpen = true)}><Plus class="size-4" aria-hidden="true" />Create an agent</Button>{/if}
    {/snippet}
  </EmptyState>
{:else}
  <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each agents.current ?? [] as agent (agent.id)}
      {@const stats = statsFor(agent.id)}
      <li class="group relative flex flex-col rounded-xl border border-border bg-surface p-4 shadow-soft transition-colors hover:border-primary/40">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true"><Bot class="size-4" /></span>
          <div class="min-w-0">
            <h2 class="font-medium">
              <a href={`#/agents/${encodeURIComponent(agent.id)}`} class="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{agent.name}</a>
            </h2>
            <p class="text-xs text-muted-foreground">{modelFor(agent.modelId).name}</p>
          </div>
        </div>
        <p class="mt-3 line-clamp-2 text-sm text-muted-foreground">{agent.description || agent.instructions}</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each agent.tools as tool (tool)}
            <Badge variant="outline"><Wrench aria-hidden="true" />{tool}{agent.approvalTools.includes(tool) ? ' · approval' : ''}</Badge>
          {:else}
            <Badge variant="secondary">No tools</Badge>
          {/each}
        </div>
        <dl class="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
          <div><dt class="text-muted-foreground">Runs</dt><dd class="font-medium">{stats.runs}</dd></div>
          <div>
            <dt class="text-muted-foreground">Last eval</dt>
            <dd class="font-medium">{stats.latest ? percent(stats.latest.passed, stats.latest.passed + stats.latest.failed) : '—'}</dd>
          </div>
          <div><dt class="text-muted-foreground">Last run</dt><dd class="font-medium">{stats.lastRun ? timeAgo(stats.lastRun, clock.now) : '—'}</dd></div>
        </dl>
      </li>
    {/each}
  </ul>
{/if}

<AgentDialog bind:open={dialogOpen} />
