<script lang="ts">
import { ArrowLeft, Bot, Pencil, Play, Square, Trash2 } from '@lucide/svelte';
import type { AgentRunHandle, AgentStep } from '@protoyard/ai';
import { RichAnswer } from '@protoyard/ai-ui';
import {
  can,
  getRuntime,
  isValidationError,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Badge, Button, EmptyState, Notice, Skeleton, Textarea } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Code } from 'texuli/kbd-code';
import { ListItem } from 'texuli/list-item';
import { Box, Heading, Text } from 'texuli/typography';
import AgentDialog from '../components/AgentDialog.svelte';
import RunStatusBadge from '../components/RunStatusBadge.svelte';
import StepTimeline from '../components/StepTimeline.svelte';
import type { ConsoleDatabase, Run } from '../database/schema.ts';
import { formatCost, modelFor } from '../domain/agents.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { timeAgo } from '../lib/format.ts';
import { services } from '../lib/services.ts';

let { params }: { params: { id?: string } } = $props();

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const id = $derived(params.id ?? '');
const agent = liveQuery(() => runtime.db.agents.get(id), { deps: () => id });
const recent = liveQuery(
  async () =>
    (await runtime.db.runs.where('agentId').equals(id).toArray())
      .filter((r) => r.source === 'playground')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
  { initial: [], deps: () => id }
);

const canEdit = $derived(can(CAPABILITIES.agentsUpdate));
const canDelete = $derived(can(CAPABILITIES.agentsDelete));
const canRun = $derived(can(CAPABILITIES.runsCreate));

let editOpen = $state(false);
let deleteOpen = $state(false);

// Playground state for the live run.
let prompt = $state('');
let promptError = $state<string | undefined>();
let steps = $state<AgentStep[]>([]);
let status = $state<string | null>(null);
let finished = $state<Run | null>(null);
let handle: AgentRunHandle | null = null;

async function start(event: SubmitEvent) {
  event.preventDefault();
  promptError = undefined;
  steps = [];
  finished = null;
  status = 'running';
  const result = await runService(() =>
    services().playground.start(id, { prompt }, (step) => {
      steps = [...steps, step];
      status = step.type === 'approval-requested' ? 'awaiting-approval' : 'running';
    })
  );
  if (!result.ok) {
    status = null;
    if (isValidationError(result.error)) promptError = result.error.issues.prompt;
    return;
  }
  handle = result.value.handle;
  const saved = await runService(() => result.value.saved, {
    errorTitle: 'Run could not be saved',
  });
  handle = null;
  if (saved.ok) {
    finished = saved.value;
    status = saved.value.status;
  } else status = 'failed';
}

async function remove() {
  const result = await runService(() => services().agents.remove(id), { success: 'Agent deleted' });
  if (result.ok) navigate('/');
}
</script>

<Button href="#/" variant="ghost" size="sm" class="mb-4 gap-1.5 px-2">
  <LucideIcon icon={ArrowLeft} class="size-4" />Agents
</Button>

{#if agent.loading}
  <Skeleton class="h-64" />
{:else if !agent.current}
  <EmptyState icon={Bot} title="Agent not found" description="It may have been deleted, or a different scenario is loaded." />
{:else}
  {@const a = agent.current}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <Heading level={1} size="xl">{a.name}</Heading>
      <Text size="sm" tone="muted" class="mt-1">{a.description}</Text>
    </div>
    <div class="flex gap-2">
      {#if canEdit}<Button variant="outline" onclick={() => (editOpen = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>{/if}
      {#if canDelete}<Button variant="outline" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" />Delete</Button>{/if}
    </div>
  </div>

  <div class="detail-grid grid gap-6">
    <Box as="section" aria-labelledby="playground-title" surface="default" border="default" radius="xl" elevation="sm" padding="md">
      <div class="flex items-center justify-between gap-2">
        <Heading level={2} size="sm" id="playground-title">Playground</Heading>
        {#if status}<RunStatusBadge {status} />{/if}
      </div>
      {#if canRun}
        <form class="mt-3 space-y-2" onsubmit={start} novalidate>
          <label for="prompt" class="sr-only">Prompt</label>
          <Textarea id="prompt" rows={3} bind:value={prompt} placeholder="Look up the customer Jordan Lee and search for incident notes" aria-invalid={promptError ? 'true' : undefined} aria-describedby={promptError ? 'prompt-error' : undefined} />
          {#if promptError}<Text size="sm" tone="destructive" id="prompt-error">{promptError}</Text>{/if}
          <div class="flex flex-wrap gap-2">
            <Button type="submit" loading={status === 'running'} disabled={status === 'awaiting-approval'}><LucideIcon icon={Play} class="size-4" />Run agent</Button>
            {#if status === 'running' || status === 'awaiting-approval'}
              <Button variant="ghost" onclick={() => handle?.cancel()}><LucideIcon icon={Square} class="size-4" />Cancel</Button>
            {/if}
          </div>
        </form>
      {:else}
        <Text size="sm" tone="muted" class="mt-3">Your role can read traces but cannot start runs.</Text>
      {/if}

      {#if status === 'awaiting-approval'}
        <Notice tone="warning" class="mt-4">
          <div class="flex flex-wrap items-center gap-2">
            <Text as="span" size="sm" class="flex-1">The agent wants to call <Code>{steps.at(-1)?.tool}</Code>. Approve the call?</Text>
            <Button size="sm" onclick={() => handle?.approve()}>Approve</Button>
            <Button size="sm" variant="outline" onclick={() => handle?.reject('Declined in the playground.')}>Reject</Button>
          </div>
        </Notice>
      {/if}

      {#if steps.length > 0}
        <div class="mt-5"><StepTimeline {steps} /></div>
      {/if}
      {#if finished?.answer}
        <Box border="default" radius="lg" padding="md" class="mt-5">
          <RichAnswer content={finished.answer} label="Simulated agent answer" />
          <Text size="xs" tone="muted" class="mt-3">
            {finished.promptTokens + finished.completionTokens} estimated tokens · {formatCost(finished.costMicros)} estimated ·
            <Button href={`#/runs/${finished.id}`} variant="link" size="sm" class="h-auto p-0">Open trace</Button>
          </Text>
        </Box>
      {/if}
    </Box>

    <aside class="space-y-4">
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" aria-labelledby="definition-title">
        <Heading level={2} size="sm" id="definition-title">Definition</Heading>
        <dl class="mt-3 space-y-3">
          <div><dt><Text as="span" size="xs" tone="muted">Model</Text></dt><dd><Text as="span" size="sm">{modelFor(a.modelId).name}</Text> <Badge variant="secondary">simulated</Badge></dd></div>
          <div>
            <dt><Text as="span" size="xs" tone="muted">Tools</Text></dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              {#each a.tools as tool (tool)}<Badge variant="outline">{tool}{a.approvalTools.includes(tool) ? ' · approval' : ''}</Badge>{:else}<Text as="span" size="sm">None</Text>{/each}
            </dd>
          </div>
          <div><dt><Text as="span" size="xs" tone="muted">Instructions</Text></dt><dd class="mt-1"><Text size="sm" tone="muted" class="whitespace-pre-wrap">{a.instructions}</Text></dd></div>
        </dl>
      </Box>
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" aria-labelledby="recent-runs-title">
        <Heading level={2} size="sm" id="recent-runs-title">Recent runs</Heading>
        <ul class="mt-2">
          {#each recent.current ?? [] as run (run.id)}
            <ListItem href={`#/runs/${run.id}`} title={run.prompt} description={timeAgo(run.createdAt, clock.now)}>
              {#snippet trailing()}<RunStatusBadge status={run.status} />{/snippet}
            </ListItem>
          {:else}
            <li class="py-2"><Text size="sm" tone="muted">No runs yet.</Text></li>
          {/each}
        </ul>
      </Box>
    </aside>
  </div>

  <AgentDialog bind:open={editOpen} agent={a} />
  <AlertDialog
    bind:open={deleteOpen}
    title={`Delete ${a.name}?`}
    description="Its runs, datasets and evaluations are deleted too. This cannot be undone (load a snapshot to go back)."
    confirmLabel="Delete agent"
    destructive
    onConfirm={remove}
  />
{/if}

<style>
  /* The playground and a fixed side column on wide screens; layout only. */
  @media (min-width: 64rem) {
    .detail-grid {
      grid-template-columns: minmax(0, 1fr) 20rem;
    }
  }
</style>
