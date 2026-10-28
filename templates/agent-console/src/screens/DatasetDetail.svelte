<script lang="ts">
import { ArrowLeft, CircleCheck, CircleX, FileQuestion, Play, Trash2 } from '@lucide/svelte';
import {
  can,
  getRuntime,
  isValidationError,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import type { ConsoleDatabase, Evaluation } from '../database/schema.ts';
import { TOOL_NAMES } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { percent, timeAgo } from '../lib/format.ts';
import { services } from '../lib/services.ts';

let { params }: { params: { id?: string } } = $props();

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const id = $derived(params.id ?? '');
const dataset = liveQuery(() => runtime.db.datasets.get(id), { deps: () => id });
const agentId = $derived(dataset.current?.agentId ?? '');
const agent = liveQuery(() => runtime.db.agents.get(agentId), { deps: () => agentId });
const evaluations = liveQuery(
  async () =>
    (await runtime.db.evaluations.where('datasetId').equals(id).toArray()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ),
  { initial: [], deps: () => id }
);

const canWrite = $derived(can(CAPABILITIES.datasetsWrite));
const canRun = $derived(can(CAPABILITIES.evaluationsRun));

let form = $state({ prompt: '', expectTool: 'none', expectText: '' });
let errors = $state<Record<string, string>>({});
let adding = $state(false);
let running = $state(false);
let deleteOpen = $state(false);
let selected = $state<string | null>(null);
const shown = $derived<Evaluation | undefined>(
  (evaluations.current ?? []).find((e) => e.id === selected) ?? evaluations.current?.[0]
);

async function addCase(event: SubmitEvent) {
  event.preventDefault();
  adding = true;
  const input = {
    prompt: form.prompt,
    expectTool:
      form.expectTool === 'none' ? null : (form.expectTool as (typeof TOOL_NAMES)[number]),
    expectText: form.expectText,
  };
  const result = await runService(() => services().datasets.addCase(id, input), {
    success: 'Case added',
  });
  adding = false;
  if (result.ok) {
    form = { prompt: '', expectTool: 'none', expectText: '' };
    errors = {};
  } else if (isValidationError(result.error)) errors = result.error.issues;
}

async function runEvaluation() {
  running = true;
  const result = await runService(() => services().evaluations.run(id));
  running = false;
  if (result.ok) {
    selected = result.value.id;
    const { passed, failed } = result.value;
    toast.success('Evaluation finished', {
      description: `${passed} of ${passed + failed} cases passed.`,
    });
  }
}

async function remove() {
  const result = await runService(() => services().datasets.remove(id), {
    success: 'Dataset deleted',
  });
  if (result.ok) navigate('/evaluations');
}

const caseResult = (caseId: string) => shown?.results.find((r) => r.caseId === caseId);
</script>

<a href="#/evaluations" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <LucideIcon icon={ArrowLeft} class="size-4" />Evaluations
</a>

{#if dataset.loading}
  <Skeleton class="h-64 rounded-xl" />
{:else if !dataset.current}
  <EmptyState icon={FileQuestion} title="Dataset not found" description="It may have been deleted." />
{:else}
  {@const d = dataset.current}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">{d.name}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Evaluates {#if agent.current}<a class="underline" href={`#/agents/${d.agentId}`}>{agent.current.name}</a>{:else}a deleted agent{/if}
        · {d.cases.length} case{d.cases.length === 1 ? '' : 's'}
      </p>
    </div>
    <div class="flex gap-2">
      {#if canRun}
        <Button onclick={runEvaluation} loading={running} disabled={d.cases.length === 0 || !agent.current}><LucideIcon icon={Play} class="size-4" />Run evaluation</Button>
      {/if}
      {#if canWrite}<Button variant="outline" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" />Delete</Button>{/if}
    </div>
  </div>

  {#if (evaluations.current?.length ?? 0) > 0}
    <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted-foreground">Showing</span>
      <Select
        aria-label="Evaluation run"
        class="w-72"
        items={(evaluations.current ?? []).map((e) => ({ value: e.id, label: `${timeAgo(e.createdAt, clock.now)} · ${e.passed}/${e.passed + e.failed} passed` }))}
        value={shown?.id ?? ''}
        onValueChange={(value) => (selected = value)}
      />
      {#if shown}<Badge variant={shown.failed === 0 ? 'success' : 'warning'}>{percent(shown.passed, shown.passed + shown.failed)}</Badge>{/if}
    </div>
  {/if}

  <ul class="space-y-3">
    {#each d.cases as testCase (testCase.id)}
      {@const result = caseResult(testCase.id)}
      <li class="rounded-xl border border-border bg-surface p-4 shadow-soft">
        <div class="flex items-start gap-3">
          {#if result}
            {#if result.pass}<LucideIcon icon={CircleCheck} class="mt-0.5 size-5 shrink-0 text-success" label="Passed" />{:else}<LucideIcon icon={CircleX} class="mt-0.5 size-5 shrink-0 text-destructive" label="Failed" />{/if}
          {/if}
          <div class="min-w-0 flex-1">
            <p class="font-medium">{testCase.prompt}</p>
            <p class="mt-1 flex flex-wrap gap-1.5 text-xs">
              {#if testCase.expectTool}<Badge variant="outline">calls {testCase.expectTool}</Badge>{/if}
              {#if testCase.expectText}<Badge variant="outline">mentions “{testCase.expectText}”</Badge>{/if}
            </p>
            {#if result && !result.pass}
              <ul class="mt-2 list-disc pl-5 text-sm text-destructive">{#each result.reasons as reason (reason)}<li>{reason}</li>{/each}</ul>
            {/if}
            {#if result}<a class="mt-2 inline-block text-xs underline" href={`#/runs/${result.runId}`}>Open trace</a>{/if}
          </div>
          {#if canWrite}
            <Button variant="ghost" size="icon" aria-label={`Remove case: ${testCase.prompt}`} onclick={() => runService(() => services().datasets.removeCase(id, testCase.id), { success: 'Case removed' })}>
              <LucideIcon icon={Trash2} class="size-4" />
            </Button>
          {/if}
        </div>
      </li>
    {:else}
      <li><EmptyState size="sm" title="No cases yet" description="Add a prompt and what a good run should do." /></li>
    {/each}
  </ul>

  {#if canWrite}
    <form class="mt-6 grid gap-4 rounded-xl border border-dashed border-border p-4 sm:grid-cols-2" onsubmit={addCase} novalidate>
      <h2 class="font-medium sm:col-span-2">Add a case</h2>
      <FormField label="Prompt" required error={errors.prompt} class="sm:col-span-2">
        {#snippet children(control)}
          <Textarea {...control.props} rows={2} bind:value={form.prompt} placeholder="Look up the customer Taylor Morgan" />
        {/snippet}
      </FormField>
      <FormField label="Expected tool" error={errors.expectTool}>
        {#snippet children(control)}
          <Select {...control.props} items={[{ value: 'none', label: 'No tool required' }, ...TOOL_NAMES.map((t) => ({ value: t, label: t }))]} bind:value={form.expectTool} />
        {/snippet}
      </FormField>
      <FormField label="Answer mentions" error={errors.expectText}>
        {#snippet children(control)}
          <Input {...control.props} bind:value={form.expectText} placeholder="Taylor" />
        {/snippet}
      </FormField>
      <div class="sm:col-span-2"><Button type="submit" loading={adding}><Icon icon="plus" class="size-4" aria-hidden="true" />Add case</Button></div>
    </form>
  {/if}

  <AlertDialog
    bind:open={deleteOpen}
    title={`Delete ${d.name}?`}
    description="Its evaluations and their runs are deleted too."
    confirmLabel="Delete dataset"
    destructive
    onConfirm={remove}
  />
{/if}
