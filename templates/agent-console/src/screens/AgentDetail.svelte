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
import { AlertDialog, Badge, Button, EmptyState, Skeleton, Textarea } from '@protoyard/ui';
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

<a href="#/" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft class="size-4" aria-hidden="true" />Agents
</a>

{#if agent.loading}
  <Skeleton class="h-64 rounded-xl" />
{:else if !agent.current}
  <EmptyState icon={Bot} title="Agent not found" description="It may have been deleted, or a different scenario is loaded." />
{:else}
  {@const a = agent.current}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{a.name}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{a.description}</p>
    </div>
    <div class="flex gap-2">
      {#if canEdit}<Button variant="outline" onclick={() => (editOpen = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>{/if}
      {#if canDelete}<Button variant="outline" onclick={() => (deleteOpen = true)}><Trash2 class="size-4" aria-hidden="true" />Delete</Button>{/if}
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <section aria-labelledby="playground-title" class="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <div class="flex items-center justify-between gap-2">
        <h2 id="playground-title" class="font-medium">Playground</h2>
        {#if status}<RunStatusBadge {status} />{/if}
      </div>
      {#if canRun}
        <form class="mt-3 space-y-2" onsubmit={start} novalidate>
          <label for="prompt" class="sr-only">Prompt</label>
          <Textarea id="prompt" rows={3} bind:value={prompt} placeholder="Look up the customer Jordan Lee and search for incident notes" aria-invalid={promptError ? 'true' : undefined} aria-describedby={promptError ? 'prompt-error' : undefined} />
          {#if promptError}<p id="prompt-error" class="text-sm text-destructive">{promptError}</p>{/if}
          <div class="flex flex-wrap gap-2">
            <Button type="submit" loading={status === 'running'} disabled={status === 'awaiting-approval'}><Play class="size-4" aria-hidden="true" />Run agent</Button>
            {#if status === 'running' || status === 'awaiting-approval'}
              <Button variant="ghost" onclick={() => handle?.cancel()}><Square class="size-4" aria-hidden="true" />Cancel</Button>
            {/if}
          </div>
        </form>
      {:else}
        <p class="mt-3 text-sm text-muted-foreground">Your role can read traces but cannot start runs.</p>
      {/if}

      {#if status === 'awaiting-approval'}
        <div class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
          <span class="flex-1">The agent wants to call <code>{steps.at(-1)?.tool}</code>. Approve the call?</span>
          <Button size="sm" onclick={() => handle?.approve()}>Approve</Button>
          <Button size="sm" variant="outline" onclick={() => handle?.reject('Declined in the playground.')}>Reject</Button>
        </div>
      {/if}

      {#if steps.length > 0}
        <div class="mt-5"><StepTimeline {steps} /></div>
      {/if}
      {#if finished?.answer}
        <div class="mt-5 rounded-lg border border-border bg-background p-4">
          <RichAnswer content={finished.answer} label="Simulated agent answer" />
          <p class="mt-3 text-xs text-muted-foreground">
            {finished.promptTokens + finished.completionTokens} estimated tokens · {formatCost(finished.costMicros)} estimated ·
            <a class="underline" href={`#/runs/${finished.id}`}>Open trace</a>
          </p>
        </div>
      {/if}
    </section>

    <aside class="space-y-4">
      <section class="rounded-xl border border-border bg-surface p-4 text-sm shadow-soft">
        <h2 class="font-medium">Definition</h2>
        <dl class="mt-3 space-y-3">
          <div><dt class="text-xs text-muted-foreground">Model</dt><dd>{modelFor(a.modelId).name} <Badge variant="secondary">simulated</Badge></dd></div>
          <div>
            <dt class="text-xs text-muted-foreground">Tools</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              {#each a.tools as tool (tool)}<Badge variant="outline">{tool}{a.approvalTools.includes(tool) ? ' · approval' : ''}</Badge>{:else}None{/each}
            </dd>
          </div>
          <div><dt class="text-xs text-muted-foreground">Instructions</dt><dd class="mt-1 whitespace-pre-wrap text-muted-foreground">{a.instructions}</dd></div>
        </dl>
      </section>
      <section class="rounded-xl border border-border bg-surface p-4 text-sm shadow-soft">
        <h2 class="font-medium">Recent runs</h2>
        <ul class="mt-2 divide-y divide-border">
          {#each recent.current ?? [] as run (run.id)}
            <li class="py-2">
              <a href={`#/runs/${run.id}`} class="line-clamp-1 hover:underline">{run.prompt}</a>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><RunStatusBadge status={run.status} />{timeAgo(run.createdAt, clock.now)}</div>
            </li>
          {:else}
            <li class="py-2 text-muted-foreground">No runs yet.</li>
          {/each}
        </ul>
      </section>
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
