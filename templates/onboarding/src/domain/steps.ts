import {
  ACTIONABLE_STEPS,
  type OnboardingState,
  OPTIONAL_STEPS,
  STEP_IDS,
  type StepId,
} from '../database/schema.ts';

/**
 * Pure step logic shared by services, the generator and screens. Keeping it
 * free of IO makes "where should this person resume?" trivially testable.
 */

export const STEP_DETAILS: Record<StepId, { label: string; description: string }> = {
  profile: { label: 'Profile', description: 'Tell us about you' },
  workspace: { label: 'Workspace', description: 'Name your space' },
  invite: { label: 'Invite teammates', description: 'Optional' },
  preferences: { label: 'Preferences', description: 'Optional' },
  done: { label: 'Done', description: 'Review and finish' },
};

export const stepIndex = (step: StepId) => STEP_IDS.indexOf(step);
export const isOptional = (step: StepId) => OPTIONAL_STEPS.includes(step);
export const nextStep = (step: StepId): StepId => STEP_IDS[stepIndex(step) + 1] ?? 'done';
export const previousStep = (step: StepId): StepId =>
  STEP_IDS[Math.max(0, stepIndex(step) - 1)] ?? 'profile';

/**
 * Maps a 0..1 progress (e.g. `scenario.actor.onboardingProgress`) to the
 * steps already finished: 0.5 of 4 answer steps → 2 done, resume at step 3.
 */
export function stepsForProgress(progress: number): {
  completed: StepId[];
  current: StepId;
} {
  const count = Math.max(
    0,
    Math.min(ACTIONABLE_STEPS.length, Math.round(progress * ACTIONABLE_STEPS.length))
  );
  const completed = ACTIONABLE_STEPS.slice(0, count);
  return { completed, current: ACTIONABLE_STEPS[count] ?? 'done' };
}

/** A step is reachable once every step before it was completed or skipped. */
export function canVisit(
  state: Pick<OnboardingState, 'completedSteps' | 'skippedSteps' | 'currentStep'>,
  step: StepId
): boolean {
  if (step === state.currentStep) return true;
  const settled = new Set([...state.completedSteps, ...state.skippedSteps]);
  return STEP_IDS.slice(0, stepIndex(step)).every((s) => settled.has(s));
}

/** Required steps still missing before onboarding can be finished. */
export function missingRequired(state: Pick<OnboardingState, 'completedSteps'>): StepId[] {
  return ACTIONABLE_STEPS.filter((s) => !isOptional(s) && !state.completedSteps.includes(s));
}

/** Share of the wizard settled (answer steps completed or skipped, plus finishing), 0..1. */
export function progressOf(
  state: Pick<OnboardingState, 'completedSteps' | 'skippedSteps' | 'completedAt'>
): number {
  if (state.completedAt) return 1;
  const settled = new Set([...state.completedSteps, ...state.skippedSteps]);
  return ACTIONABLE_STEPS.filter((s) => settled.has(s)).length / STEP_IDS.length;
}
