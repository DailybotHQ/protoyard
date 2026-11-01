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
  AlertDialog,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingState,
  Progress,
} from '@protoyard/ui';
import {
  createFormController,
  type FormController,
  type FormStepContext,
  type FormStepResult,
  SchemaForm,
  type SchemaFormActions,
  type SchemaFormCustomField,
} from '@texuli/forms';
import { onDestroy, onMount, untrack } from 'svelte';
import { getSaas } from '../../context.ts';
import { compileKitForm } from '../../lib/schema-form.ts';
import {
  defaultOnboardingSteps,
  type OnboardingRuntime,
  type OnboardingUiStep,
  onboardingFormSchema,
  REVIEW_FIELD,
  stepFormValues,
  stepInput,
  stepValues,
  stepValuesFromForm,
} from './steps.ts';

/**
 * The persisted onboarding wizard: one multi-step `@texuli/forms` form driven
 * by its controller, on the kit engine (`createOnboarding`). Each Next runs
 * `onStep`, which applies the answer and saves it with the position in one
 * transaction; Back and Skip are persisted too, so a reload resumes exactly
 * where the person stopped. Finishing marks the persona `onboardingComplete`;
 * Restart (confirmed) starts over with earlier answers as defaults.
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
const customSteps = untrack(() => new Set(Object.keys(snippets)));
const onboarding = createOnboarding(runtime as never, {
  steps: definedSteps,
  ...(initialCapability ? { capability: initialCapability } : {}),
});
const flow = onboarding.flow;
const ctx = { runtime };

let progressRow = $state<SaasOnboarding | null>(null);
let loadError = $state<string | null>(null);
/** Service issues by the step's own field names (what custom snippets show). */
let issues = $state<Record<string, string>>({});
let skipping = $state(false);
let restartOpen = $state(false);
// Raw: the controller and the compiled form are owned by Texuli, never proxied.
let controller = $state.raw<FormController | null>(null);
let form = $state.raw<ReturnType<typeof compileKitForm> | null>(null);
/** Earlier answers, kept so a restart starts from them. */
let answers: Record<string, Record<string, string>> = {};
/**
 * Moves that are already saved (resuming at the stored step, or a skip):
 * `onStep` lets them through without saving the answer again.
 */
let replaying = false;
let position = 0;
let unsubscribe: (() => void) | null = null;

const progress = $derived(progressRow ? Math.round(flow.progressOf(progressRow) * 100) : 0);
const readOnly = (step: OnboardingUiStep) => step.readOnly?.(ctx) ?? false;

/** Takes a saved row and folds its answers into the values a new form starts from. */
function adopt(next: SaasOnboarding) {
  progressRow = next;
  for (const step of definedSteps) {
    const saved = stepValues(step, next.answers[step.id]);
    answers[step.id] = { ...(step.defaults?.(ctx) ?? {}), ...answers[step.id], ...saved };
  }
}

/** A new form and controller for the saved row, moved to its current step. */
async function start(row: SaasOnboarding) {
  unsubscribe?.();
  controller?.destroy();
  controller = null;
  form = null;
  const compiled = compileKitForm(
    onboardingFormSchema(definedSteps, {
      // Not the page title: the form's visually hidden heading must not repeat the h1.
      title: 'Setup steps',
      doneLabel: flow.label(DONE_STEP),
      custom: customSteps,
      readOnly,
    })
  );
  const next = createFormController(compiled, {
    values: stepFormValues(definedSteps, answers, customSteps),
    onStep,
    onSubmit: finish,
  });
  position = 0;
  unsubscribe = next.subscribe(persistBack);
  // Replay to the saved step before the form shows, so nothing can be clicked mid-way.
  const target = Math.max(0, flow.ids.indexOf(row.currentStep));
  replaying = true;
  try {
    await next.goTo(target);
  } finally {
    replaying = false;
  }
  position = next.getState().step;
  form = compiled;
  controller = next;
}

onMount(() => {
  onboarding.state().then(
    async (row) => {
      adopt(row);
      if (!row.completedAt) await start(row);
    },
    (error: unknown) => {
      loadError = error instanceof Error ? error.message : String(error);
    }
  );
});
onDestroy(() => {
  unsubscribe?.();
  controller?.destroy();
});

/** Rolls `emails.1` (one item of a list) up to `emails`; returns the message for the step. */
function messageOf(error: unknown): string {
  const found = (error as { issues?: Record<string, string> }).issues;
  if (found) {
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

/** Next: apply the real change → save answer + position → afterSubmit. Errors keep the step. */
async function onStep({ step: formStep }: FormStepContext): Promise<FormStepResult> {
  if (replaying) return { ok: true };
  const step = definedSteps[formStep.index];
  if (!step || !controller) return { ok: true };
  issues = {};
  // Every value of the step, read-only ones too (Texuli does not submit disabled fields).
  const typed = stepValuesFromForm(step, formStep.index, controller.getState().values, customSteps);
  try {
    const input = stepInput(step, typed);
    const answer = step.schema ? parseInput(step.schema, input) : undefined;
    await step.apply?.(answer, ctx);
    adopt(await onboarding.submit(step.id, input));
    await step.afterSubmit?.(answer, ctx);
    position = formStep.index + 1;
    return { ok: true };
  } catch (error) {
    const message = messageOf(error);
    const errors: Record<string, string> = {};
    if (!customSteps.has(step.id)) {
      (step.fields ?? []).forEach((field, index) => {
        const issue = issues[field.name];
        if (issue) errors[`s${formStep.index}_f${index}`] = issue;
      });
    }
    return Object.keys(errors).length > 0
      ? { ok: false, errors, ...(issues.form ? { message: issues.form } : {}) }
      : { ok: false, message };
  }
}

/** Back (or a click on an earlier step) is persisted, so a reload lands there too. */
function persistBack(state: { step: number }) {
  if (replaying || state.step >= position) {
    position = state.step;
    return;
  }
  position = state.step;
  const id = flow.ids[state.step];
  if (!id || !progressRow || id === progressRow.currentStep) return;
  onboarding.goTo(id).then(adopt, (error: unknown) => {
    loadError = messageOf(error);
  });
}

async function skip(actions: SchemaFormActions) {
  const step = definedSteps[actions.step];
  if (!step?.optional || skipping) return;
  skipping = true;
  issues = {};
  try {
    adopt(await onboarding.skip(step.id));
    replaying = true;
    await actions.next();
  } catch (error) {
    loadError = messageOf(error);
  } finally {
    replaying = false;
    skipping = false;
  }
}

async function finish(): Promise<FormStepResult> {
  try {
    adopt(await onboarding.complete());
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
  unsubscribe?.();
  if (onComplete) onComplete();
  else navigate(nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath));
  return { ok: true };
}

async function restart() {
  const row = await onboarding.restart();
  adopt(row);
  issues = {};
  await start(row);
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

const asStrings = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string') out[key] = entry;
  }
  return out;
};
</script>

{#snippet summary(id: string | undefined = undefined)}
  <dl class="grid gap-2 text-sm" {id}>
    {#each definedSteps as step (step.id)}
      <div class="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
        <dt class="font-medium">{step.label}</dt>
        <dd class="text-muted-foreground">{answerSummary(step)}</dd>
      </div>
    {/each}
  </dl>
{/snippet}

<!-- A prototype's own step body, painted inside the Texuli form as a custom field. -->
{#snippet customStep(field: SchemaFormCustomField)}
  {@const step = definedSteps.find((s) => s.id === field.config.step)}
  {@const current = asStrings(field.value)}
  {#if step}
    {@render snippets[step.id]?.({
      step,
      values: current,
      issues,
      readOnly: field.disabled || field.readOnly,
      setValue: (name, value) => field.setValue({ ...asStrings(field.value), [name]: value }),
    })}
  {/if}
{/snippet}

{#snippet reviewField(field: SchemaFormCustomField)}
  {@render summary(field.id)}
{/snippet}

{#snippet actions(state: SchemaFormActions)}
  {@const step = definedSteps[state.step]}
  {#if state.step > 0}
    <Button type="button" variant="outline" onclick={() => state.back()} disabled={state.submitting || skipping}>Back</Button>
  {/if}
  {#if !state.last && step?.optional}
    <Button type="button" variant="ghost" loading={skipping} disabled={state.submitting} onclick={() => skip(state)}>Skip for now</Button>
  {/if}
  <Button
    type="submit"
    loading={state.submitting && !skipping}
    loadingLabel={state.last ? 'Finishing setup' : 'Saving'}
    disabled={state.submitting || skipping}
  >
    {state.last ? 'Finish setup' : 'Next'}
  </Button>
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
        {@render summary()}
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
  {:else if form && controller}
    {#key controller}
      <SchemaForm
        {form}
        {controller}
        customFields={{ 'onboarding-step': customStep, [REVIEW_FIELD]: reviewField }}
        {actions}
        labels={{ submitted: 'Setup finished.', submitting: 'Finishing setup', checking: 'Saving' }}
        aria-label={title}
        class="py-saas-form"
        data-py-saas-form="onboarding"
        headingLevel={2}
        hideTitle
      />
    {/key}
  {:else}
    <LoadingState label="Loading your setup" class="py-16" />
  {/if}
</div>
