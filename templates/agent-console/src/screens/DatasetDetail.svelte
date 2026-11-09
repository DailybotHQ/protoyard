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
  Card,
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
import { Box, Heading, Text } from 'texuli/typography';
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

<Button href="#/evaluations" variant="ghost" size="sm" class="mb-4 gap-1.5 px-2">
  <LucideIcon icon={ArrowLeft} class="size-4" />Evaluations
</Button>

{#if dataset.loading}
  <Skeleton class="h-64" />
{:else if !dataset.current}
  <EmptyState icon={FileQuestion} title="Dataset not found" description="It may have been deleted." />
{:else}
  {@const d = dataset.current}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <Heading level={1} size="xl">{d.name}</Heading>
      <Text size="sm" tone="muted" class="mt-1">
        Evaluates {#if agent.current}<Button href={`#/agents/${d.agentId}`} variant="link" size="sm" class="h-auto p-0">{agent.current.name}</Button>{:else}a deleted agent{/if}
        · {d.cases.length} case{d.cases.length === 1 ? '' : 's'}
      </Text>
    </div>
    <div class="flex gap-2">
      {#if canRun}
        <Button onclick={runEvaluation} loading={running} disabled={d.cases.length === 0 || !agent.current}><LucideIcon icon={Play} class="size-4" />Run evaluation</Button>
      {/if}
      {#if canWrite}<Button variant="outline" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" />Delete</Button>{/if}
    </div>
  </div>

  {#if (evaluations.current?.length ?? 0) > 0}
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Text as="span" size="sm" tone="muted">Showing</Text>
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
      <li><Card class="p-4">
        <div class="flex items-start gap-3">
          {#if result}
            {#if result.pass}<LucideIcon icon={CircleCheck} tone="success" class="mt-0.5 size-5 shrink-0" label="Passed" />{:else}<LucideIcon icon={CircleX} tone="destructive" class="mt-0.5 size-5 shrink-0" label="Failed" />{/if}
          {/if}
          <div class="min-w-0 flex-1">
            <Text weight="medium">{testCase.prompt}</Text>
            <p class="mt-1 flex flex-wrap gap-1.5">
              {#if testCase.expectTool}<Badge variant="outline">calls {testCase.expectTool}</Badge>{/if}
              {#if testCase.expectText}<Badge variant="outline">mentions “{testCase.expectText}”</Badge>{/if}
            </p>
            {#if result && !result.pass}
              <ul class="mt-2 space-y-0.5">{#each result.reasons as reason (reason)}<li><Text size="sm" tone="destructive">{reason}</Text></li>{/each}</ul>
            {/if}
            {#if result}<Button href={`#/runs/${result.runId}`} variant="link" size="sm" class="mt-2 h-auto p-0">Open trace</Button>{/if}
          </div>
          {#if canWrite}
            <Button variant="ghost" size="icon" aria-label={`Remove case: ${testCase.prompt}`} onclick={() => runService(() => services().datasets.removeCase(id, testCase.id), { success: 'Case removed' })}>
              <LucideIcon icon={Trash2} class="size-4" />
            </Button>
          {/if}
        </div>
      </Card></li>
    {:else}
      <li><EmptyState size="sm" title="No cases yet" description="Add a prompt and what a good run should do." /></li>
    {/each}
  </ul>

  {#if canWrite}
    <Box border="default" radius="xl" padding="md" class="mt-6">
    <form class="grid gap-4 sm:grid-cols-2" onsubmit={addCase} novalidate aria-labelledby="add-case-title">
      <Heading level={2} size="sm" id="add-case-title" class="sm:col-span-2">Add a case</Heading>
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
    </Box>
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
