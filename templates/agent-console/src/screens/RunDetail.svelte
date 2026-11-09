<script lang="ts">
import { ArrowLeft, FileQuestion } from '@lucide/svelte';
import { RichAnswer } from '@protoyard/ai-ui';
import { getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import { Button, EmptyState, formatDay, formatTime, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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

<Button href="#/runs" variant="ghost" size="sm" class="mb-4 gap-1.5 px-2">
  <LucideIcon icon={ArrowLeft} class="size-4" />Runs
</Button>

{#if run.loading}
  <Skeleton class="h-64" />
{:else if !run.current}
  <EmptyState icon={FileQuestion} title="Run not found" description="It may have been deleted with its agent or dataset." />
{:else}
  {@const r = run.current}
  <div class="mb-6">
    <div class="flex flex-wrap items-center gap-2">
      <Heading level={1} size="xl">Run trace</Heading>
      <RunStatusBadge status={r.status} />
    </div>
    <Text size="sm" tone="muted" class="mt-1">
      {#if agent.current}<Button href={`#/agents/${r.agentId}`} variant="link" size="sm" class="h-auto p-0">{agent.current.name}</Button>{:else}Deleted agent{/if}
      · {r.source} · {formatDay(r.createdAt)} {formatTime(r.createdAt)}{actor ? ` · by ${(actor as { name: string }).name}` : ''}
    </Text>
  </div>

  <div class="detail-grid grid gap-6">
    <div class="space-y-6">
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" aria-labelledby="prompt-title">
        <Heading level={2} size="sm" tone="muted" id="prompt-title">Prompt</Heading>
        <Text class="mt-1 whitespace-pre-wrap">{r.prompt}</Text>
      </Box>
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" aria-labelledby="steps-title">
        <Heading level={2} size="sm" id="steps-title" class="mb-4">Steps ({r.steps.length})</Heading>
        <StepTimeline steps={r.steps} />
      </Box>
      {#if r.answer}
        <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" aria-labelledby="answer-title">
          <Heading level={2} size="sm" id="answer-title" class="mb-2">Answer</Heading>
          <RichAnswer content={r.answer} label="Simulated agent answer" />
        </Box>
      {/if}
    </div>
    <Box as="aside" surface="default" border="default" radius="xl" elevation="sm" padding="md" class="h-fit" aria-labelledby="usage-title">
      <Heading level={2} size="sm" id="usage-title">Usage (estimated)</Heading>
      <dl class="mt-3 grid grid-cols-2 gap-3">
        <div><dt><Text as="span" size="xs" tone="muted">Model</Text></dt><dd><Text as="span" size="sm">{modelFor(r.modelId).name}</Text></dd></div>
        <div><dt><Text as="span" size="xs" tone="muted">Cost</Text></dt><dd><Text as="span" size="sm" tabular>{formatCost(r.costMicros)}</Text></dd></div>
        <div><dt><Text as="span" size="xs" tone="muted">Prompt tokens</Text></dt><dd><Text as="span" size="sm" tabular>{formatNumber(r.promptTokens)}</Text></dd></div>
        <div><dt><Text as="span" size="xs" tone="muted">Completion</Text></dt><dd><Text as="span" size="sm" tabular>{formatNumber(r.completionTokens)}</Text></dd></div>
      </dl>
      <Text size="xs" tone="muted" class="mt-3">Token counts and costs are simulated estimates, not provider billing.</Text>
    </Box>
  </div>
{/if}

<style>
  /* The main column and a fixed side column on wide screens; layout only. */
  @media (min-width: 64rem) {
    .detail-grid {
      grid-template-columns: minmax(0, 1fr) 18rem;
    }
  }
</style>
