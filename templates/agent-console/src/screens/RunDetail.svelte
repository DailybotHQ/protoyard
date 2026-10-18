<script lang="ts">
import { ArrowLeft, FileQuestion } from '@lucide/svelte';
import { RichAnswer } from '@protoyard/ai-ui';
import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import { EmptyState, formatDay, formatTime, Skeleton } from '@protoyard/ui';
import RunStatusBadge from '../components/RunStatusBadge.svelte';
import StepTimeline from '../components/StepTimeline.svelte';
import type { ConsoleDatabase } from '../database/schema.ts';
import { formatCost, modelFor } from '../domain/agents.ts';
import { formatNumber } from '../lib/format.ts';

let { params }: { params: { id?: string } } = $props();

const runtime = getRuntime<ConsoleDatabase>();
const id = $derived(params.id ?? '');
const run = liveQuery(() => runtime.db.runs.get(id), { deps: () => id });
const agentId = $derived(run.current?.agentId ?? '');
const agent = liveQuery(() => runtime.db.agents.get(agentId), { deps: () => agentId });
const personas = liveQuery(() => runtime.db.table('py_personas').toArray(), { initial: [] });
const actor = $derived(
  (personas.current ?? []).find((p: { id: string }) => p.id === run.current?.actorId)
);
</script>

<a href="#/runs" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft class="size-4" aria-hidden="true" />Runs
</a>

{#if run.loading}
  <Skeleton class="h-64 rounded-xl" />
{:else if !run.current}
  <EmptyState icon={FileQuestion} title="Run not found" description="It may have been deleted with its agent or dataset." />
{:else}
  {@const r = run.current}
  <div class="mb-6">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-2xl font-semibold tracking-tight">Run trace</h1>
      <RunStatusBadge status={r.status} />
    </div>
    <p class="mt-1 text-sm text-muted-foreground">
      {#if agent.current}<a class="underline" href={`#/agents/${r.agentId}`}>{agent.current.name}</a>{:else}Deleted agent{/if}
      · {r.source} · {formatDay(r.createdAt)} {formatTime(r.createdAt)}{actor ? ` · by ${(actor as { name: string }).name}` : ''}
    </p>
  </div>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="space-y-6">
      <section class="rounded-xl border border-border bg-surface p-4 shadow-soft">
        <h2 class="text-sm font-medium text-muted-foreground">Prompt</h2>
        <p class="mt-1 whitespace-pre-wrap">{r.prompt}</p>
      </section>
      <section class="rounded-xl border border-border bg-surface p-4 shadow-soft" aria-labelledby="steps-title">
        <h2 id="steps-title" class="mb-4 font-medium">Steps ({r.steps.length})</h2>
        <StepTimeline steps={r.steps} />
      </section>
      {#if r.answer}
        <section class="rounded-xl border border-border bg-surface p-4 shadow-soft">
          <h2 class="mb-2 font-medium">Answer</h2>
          <RichAnswer content={r.answer} label="Simulated agent answer" />
        </section>
      {/if}
    </div>
    <aside class="h-fit rounded-xl border border-border bg-surface p-4 text-sm shadow-soft">
      <h2 class="font-medium">Usage (estimated)</h2>
      <dl class="mt-3 grid grid-cols-2 gap-3">
        <div><dt class="text-xs text-muted-foreground">Model</dt><dd>{modelFor(r.modelId).name}</dd></div>
        <div><dt class="text-xs text-muted-foreground">Cost</dt><dd>{formatCost(r.costMicros)}</dd></div>
        <div><dt class="text-xs text-muted-foreground">Prompt tokens</dt><dd>{formatNumber(r.promptTokens)}</dd></div>
        <div><dt class="text-xs text-muted-foreground">Completion</dt><dd>{formatNumber(r.completionTokens)}</dd></div>
      </dl>
      <p class="mt-3 text-xs text-muted-foreground">Token counts and costs are simulated estimates, not provider billing.</p>
    </aside>
  </div>
{/if}
