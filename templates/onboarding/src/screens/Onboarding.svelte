<script lang="ts">
import { runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Card, ErrorState, Progress, Skeleton, Stepper } from '@protoyard/ui';
import { STEP_IDS, type StepId } from '../database/schema.ts';
import { freshState } from '../domain/services.ts';
import { canVisit, previousStep, progressOf, STEP_DETAILS, stepIndex } from '../domain/steps.ts';
import { useOnboarding } from '../lib/context.ts';
import DoneStep from '../steps/DoneStep.svelte';
import InviteStep from '../steps/InviteStep.svelte';
import PreferencesStep from '../steps/PreferencesStep.svelte';
import ProfileStep from '../steps/ProfileStep.svelte';
import WorkspaceStep from '../steps/WorkspaceStep.svelte';

/**
 * The wizard. Its position is NOT local flow: it is read from the persisted
 * onboarding row, and every Next/Back/Skip writes that row first. So a
 * reload, a persona switch or a snapshot restore always shows the right step.
 */
const { services, progress } = useOnboarding();
const principal = usePrincipal();

const personaId = $derived(principal.current?.persona.id ?? '');
const flow = $derived(progress.current ?? freshState(personaId, ''));
const index = $derived(stepIndex(flow.currentStep));
const steps = $derived(
  STEP_IDS.map((id) => ({
    id,
    label: STEP_DETAILS[id].label,
    description: flow.skippedSteps.includes(id) ? 'Skipped' : STEP_DETAILS[id].description,
  }))
);
// Skipped steps count as settled, so they stay clickable in the stepper.
const settled = $derived(
  flow.completedAt ? [...STEP_IDS] : [...flow.completedSteps, ...flow.skippedSteps]
);
const percent = $derived(Math.round(progressOf(flow) * 100));

function go(step: StepId) {
  if (step === flow.currentStep || flow.completedAt || !canVisit(flow, step)) return;
  void runService(() => services.goTo(step));
}
const back = () => go(previousStep(flow.currentStep));
const skip = () => {
  const step = flow.currentStep;
  const answered = flow.completedSteps.includes(step);
  void runService(() => services.skip(step), {
    success: answered
      ? `Kept your earlier ${STEP_DETAILS[step].label.toLowerCase()} answers.`
      : `${STEP_DETAILS[step].label} skipped — you can come back to it.`,
  });
};
</script>

<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[15rem_1fr] lg:gap-10">
  <aside class="lg:pt-2" aria-label="Onboarding progress">
    <p class="text-sm font-medium">Step {Math.min(index + 1, STEP_IDS.length)} of {STEP_IDS.length}</p>
    <Progress class="mt-2" value={percent} ariaLabel="Onboarding progress" size="sm" />
    <p class="mt-1 text-xs text-muted-foreground">{percent}% complete · saved automatically</p>
    <Stepper
      class="mt-6 hidden lg:block"
      orientation="vertical"
      label="Onboarding steps"
      {steps}
      current={index}
      completed={settled}
      onStepClick={(i) => go(STEP_IDS[i] ?? flow.currentStep)}
    />
    <Stepper
      class="mt-5 lg:hidden"
      label="Onboarding steps"
      {steps}
      current={index}
      completed={settled}
      onStepClick={(i) => go(STEP_IDS[i] ?? flow.currentStep)}
    />
  </aside>

  <Card class="p-5 sm:p-8">
    {#if progress.error}
      <ErrorState title="Could not load your progress" message={String(progress.error)} />
    {:else if progress.loading}
      <div class="space-y-4" aria-busy="true" aria-label="Loading your progress">
        <Skeleton class="h-8 w-2/3" /><Skeleton class="h-4 w-1/2" /><Skeleton class="h-10 w-full" /><Skeleton class="h-10 w-full" />
      </div>
    {:else}
      {#key `${personaId}:${flow.currentStep}`}
        {#if flow.currentStep === 'profile'}
          <ProfileStep {flow} />
        {:else if flow.currentStep === 'workspace'}
          <WorkspaceStep onBack={back} />
        {:else if flow.currentStep === 'invite'}
          <InviteStep {flow} onBack={back} onSkip={skip} />
        {:else if flow.currentStep === 'preferences'}
          <PreferencesStep {flow} onBack={back} onSkip={skip} />
        {:else}
          <DoneStep {flow} onBack={back} onEdit={go} />
        {/if}
      {/key}
    {/if}
  </Card>
</div>
