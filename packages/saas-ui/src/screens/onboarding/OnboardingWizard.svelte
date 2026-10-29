<script lang="ts" module>
import type { Snippet } from 'svelte';

/** What a custom step snippet receives (`snippets={{ <stepId>: mySnippet }}`). */
export interface OnboardingStepSnippetArgs {
  step: import('./steps.ts').OnboardingUiStep;
  values: Record<string, string>;
  issues: Record<string, string>;
  readOnly: boolean;
  setValue(name: string, value: string): void;
}
export type OnboardingStepSnippet = Snippet<[OnboardingStepSnippetArgs]>;
</script>

<script lang="ts">
import { navigate, nextPath } from '@protoyard/renderer-svelte';
import { createOnboarding, DONE_STEP, parseInput, type SaasOnboarding } from '@protoyard/saas';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from 'texuli/select';
import {
  AlertDialog,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  LoadingState,
  Progress,
  Textarea,
  Wizard,
} from '@protoyard/ui';
import { onMount, untrack } from 'svelte';
import { getSaas } from '../../context.ts';
import {
  defaultOnboardingSteps,
  type OnboardingRuntime,
  type OnboardingUiStep,
  stepInput,
  stepValues,
} from './steps.ts';

/**
 * The persisted onboarding wizard on `@protoyard/ui` Wizard and the kit
 * engine (`createOnboarding`). Every Next saves the answer and the position
 * in one transaction, Back and Skip are persisted too, so a reload resumes
 * exactly where the person stopped. Finishing marks the persona
 * `onboardingComplete`; Restart (confirmed) starts over with earlier answers
 * as defaults.
 */
interface Props {
  /** Answer steps in order (default: profile, workspace, invite, preferences). */
  steps?: OnboardingUiStep[];
  /** Custom step bodies keyed by step id; other steps render their `fields`. */
  snippets?: Record<string, OnboardingStepSnippet>;
  /** Capability every wizard action asserts (default `onboarding:progress`). */
  capability?: string;
  title?: string;
  /** After Finish (default: go to `?next=` or the kit's home path). */
  onComplete?: () => void;
}

let {
  steps = defaultOnboardingSteps(),
  snippets = {},
  capability,
  title = 'Set up your account',
  onComplete,
}: Props = $props();

const { runtime: baseRuntime, config } = getSaas();
const runtime = baseRuntime as OnboardingRuntime;
// Steps are read once: the engine and the stored position are keyed by their ids.
const definedSteps = untrack(() => steps);
const initialCapability = untrack(() => capability);
const onboarding = createOnboarding(runtime as never, {
  steps: definedSteps,
  ...(initialCapability ? { capability: initialCapability } : {}),
});
const flow = onboarding.flow;
const ctx = { runtime };

let progressRow = $state<SaasOnboarding | null>(null);
let loadError = $state<string | null>(null);
let current = $state(0);
let values = $state<Record<string, Record<string, string>>>({});
let issues = $state<Record<string, string>>({});
let skipping = $state(false);
let restartOpen = $state(false);

const wizardSteps = $derived(
  flow.ids.map((id) => {
    const step = flow.step(id);
    return {
      id,
      label: flow.label(id),
      ...(step?.description ? { description: step.description } : {}),
    };
  })
);
const progress = $derived(progressRow ? Math.round(flow.progressOf(progressRow) * 100) : 0);
const activeId = $derived(flow.ids[current] ?? DONE_STEP);
const activeStep = $derived(definedSteps.find((s) => s.id === activeId));

/**
 * Takes a saved row. `move: false` is for Next: the Wizard advances by
 * itself after `validate` resolves, so moving here too would skip a step.
 */
function adopt(next: SaasOnboarding, { move = true }: { move?: boolean } = {}) {
  progressRow = next;
  if (move) current = Math.max(0, flow.ids.indexOf(next.currentStep));
  for (const step of definedSteps) {
    const saved = stepValues(step, next.answers[step.id]);
    values[step.id] = { ...(step.defaults?.(ctx) ?? {}), ...values[step.id], ...saved };
  }
}

onMount(() => {
  onboarding.state().then(adopt, (error: unknown) => {
    loadError = error instanceof Error ? error.message : String(error);
  });
});

const readOnly = (step: OnboardingUiStep) => step.readOnly?.(ctx) ?? false;

function setValue(stepId: string, name: string, value: string) {
  values[stepId] = { ...values[stepId], [name]: value };
  if (issues[name]) {
    const { [name]: _cleared, ...rest } = issues;
    issues = rest;
  }
}

function messageOf(error: unknown): string {
  const found = (error as { issues?: Record<string, string> }).issues;
  if (found) {
    // `emails.1` (one item of a list) is shown on the `emails` field.
    const rolled: Record<string, string> = { ...found };
    for (const [key, message] of Object.entries(found)) {
      const head = key.split('.')[0] ?? key;
      rolled[head] ??= message;
    }
    issues = rolled;
    return found.form ?? 'Fix the highlighted fields to continue.';
  }
  return error instanceof Error ? error.message : String(error);
}

/** Next: validate → apply the real change → save answer + position → afterSubmit. */
async function validate(index: number): Promise<true | string> {
  const id = flow.ids[index];
  const step = definedSteps.find((s) => s.id === id);
  if (!id || id === DONE_STEP || !step) return true;
  issues = {};
  try {
    const input = stepInput(step, values[id] ?? {});
    const answer = step.schema ? parseInput(step.schema, input) : undefined;
    await step.apply?.(answer, ctx);
    adopt(await onboarding.submit(id, input), { move: false });
    await step.afterSubmit?.(answer, ctx);
    return true;
  } catch (error) {
    return messageOf(error);
  }
}

/** Back (or a click on an earlier step) is persisted, so a reload lands there too. */
async function onStepChange(index: number) {
  const id = flow.ids[index];
  if (!id || !progressRow || id === progressRow.currentStep) return;
  try {
    adopt(await onboarding.goTo(id));
  } catch (error) {
    // Keep the screen honest: go back to where the saved state is.
    loadError = messageOf(error);
    adopt(progressRow);
  }
}

async function skip() {
  if (!activeStep?.optional || skipping) return;
  skipping = true;
  issues = {};
  try {
    adopt(await onboarding.skip(activeStep.id));
  } catch (error) {
    loadError = messageOf(error);
  } finally {
    skipping = false;
  }
}

async function finish() {
  adopt(await onboarding.complete());
  if (onComplete) onComplete();
  else navigate(nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath));
}

async function restart() {
  adopt(await onboarding.restart());
  issues = {};
}

const answerSummary = (step: OnboardingUiStep): string => {
  if (!progressRow) return '';
  if (progressRow.skippedSteps.includes(step.id)) return 'Skipped';
  const shown = stepValues(step, progressRow.answers[step.id]);
  if (!shown) return progressRow.completedSteps.includes(step.id) ? 'Done' : 'Not answered';
  return (
    Object.entries(shown)
      .filter(([, value]) => value !== '')
      .map(([name, value]) => {
        const field = step.fields?.find((f) => f.name === name);
        const label = field?.options?.find((o) => o.value === value)?.label ?? value;
        return `${field?.label ?? name}: ${label}`;
      })
      .join(' · ') || 'Done'
  );
};
</script>

{#snippet fieldsFor(step: OnboardingUiStep)}
  {@const locked = readOnly(step)}
  {@const stepValuesNow = values[step.id] ?? {}}
  {#if snippets[step.id]}
    {@render snippets[step.id]?.({
      step,
      values: stepValuesNow,
      issues,
      readOnly: locked,
      setValue: (name, value) => setValue(step.id, name, value),
    })}
  {:else}
    <form
      class="grid gap-4"
      id={`onboarding-step-${step.id}`}
      onsubmit={(event) => event.preventDefault()}
      novalidate
    >
      {#each step.fields ?? [] as field (field.name)}
        <FormField
          label={field.label}
          required={field.required ?? false}
          error={issues[field.name] ?? null}
          {...field.description ? { description: field.description } : {}}
        >
          {#snippet children(control)}
            {#if field.kind === 'emails'}
              <Textarea
                {...control.props}
                rows={3}
                value={stepValuesNow[field.name] ?? ''}
                placeholder={field.placeholder}
                disabled={locked}
                oninput={(event: Event) =>
                  setValue(step.id, field.name, (event.currentTarget as HTMLTextAreaElement).value)}
              />
            {:else if field.kind === 'select'}
              <SelectRoot
                type="single"
                value={stepValuesNow[field.name] ?? ''}
                onValueChange={(value) => setValue(step.id, field.name, value)}
                disabled={locked}
              >
                <SelectTrigger {...control.props} class="w-full" disabled={locked}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {#each field.options ?? [] as option (option.value)}
                    <SelectItem value={option.value} label={option.label} />
                  {/each}
                </SelectContent>
              </SelectRoot>
            {:else}
              <Input
                {...control.props}
                value={stepValuesNow[field.name] ?? ''}
                placeholder={field.placeholder}
                disabled={locked}
                oninput={(event: Event) =>
                  setValue(step.id, field.name, (event.currentTarget as HTMLInputElement).value)}
              />
            {/if}
          {/snippet}
        </FormField>
      {/each}
      {#if locked && step.readOnlyNote}
        <p class="text-sm text-muted-foreground">{step.readOnlyNote}</p>
      {/if}
    </form>
  {/if}
{/snippet}

<div class="mx-auto flex min-h-app w-full max-w-2xl flex-col gap-6 p-4 sm:p-8" data-saas-onboarding>
  <header class="grid gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
    {#if progressRow}
      <Progress value={progress} label="Setup progress" showValue size="sm" />
    {/if}
  </header>

  {#if loadError}
    <p role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      {loadError}
    </p>
  {/if}

  {#if !progressRow}
    {#if !loadError}<LoadingState label="Loading your setup" class="py-16" />{/if}
  {:else if progressRow.completedAt}
    <Card>
      <CardHeader>
        <CardTitle>You're all set</CardTitle>
        <CardDescription>Here is what you set up. You can change it later in settings.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <dl class="grid gap-2 text-sm">
          {#each definedSteps as step (step.id)}
            <div class="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
              <dt class="font-medium">{step.label}</dt>
              <dd class="text-muted-foreground">{answerSummary(step)}</dd>
            </div>
          {/each}
        </dl>
        <div class="flex flex-wrap gap-2">
          <Button onclick={() => navigate(config.homePath)}>Go to the app</Button>
          <AlertDialog
            bind:open={restartOpen}
            title="Restart onboarding?"
            description="You'll start again at step 1. Your earlier answers stay filled in, and people you already invited stay in the workspace."
            confirmLabel="Restart"
            onConfirm={restart}
          >
            {#snippet trigger({ props })}
              <Button variant="outline" {...props}>Restart onboarding</Button>
            {/snippet}
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  {:else}
    <Wizard
      steps={wizardSteps}
      bind:current
      {validate}
      {onStepChange}
      onFinish={finish}
      finishLabel="Finish setup"
    >
      {#snippet content({ step: wizardStep })}
        {@const step = definedSteps.find((s) => s.id === wizardStep.id)}
        {#if step}
          <div class="grid gap-4">
            <div>
              <h2 class="text-lg font-semibold">{step.label}</h2>
              {#if step.intro}<p class="text-sm text-muted-foreground">{step.intro}</p>{/if}
            </div>
            {@render fieldsFor(step)}
          </div>
        {:else}
          <div class="grid gap-3">
            <div>
              <h2 class="text-lg font-semibold">Review and finish</h2>
              <p class="text-sm text-muted-foreground">Check your answers, then finish setup.</p>
            </div>
            <dl class="grid gap-2 text-sm">
              {#each definedSteps as summaryStep (summaryStep.id)}
                <div class="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
                  <dt class="font-medium">{summaryStep.label}</dt>
                  <dd class="text-muted-foreground">{answerSummary(summaryStep)}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}
      {/snippet}
      {#snippet secondaryActions()}
        {#if activeStep?.optional}
          <Button variant="ghost" loading={skipping} onclick={skip}>Skip for now</Button>
        {/if}
      {/snippet}
    </Wizard>
  {/if}
</div>
