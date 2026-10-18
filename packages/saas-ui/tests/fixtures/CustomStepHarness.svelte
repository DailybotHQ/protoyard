<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { z } from 'zod';
import type { OnboardingStepSnippetArgs } from '../../src/screens/onboarding/OnboardingWizard.svelte';
import type { OnboardingUiStep } from '../../src/screens/onboarding/steps.ts';
import OnboardingHarness from './OnboardingHarness.svelte';

/** A prototype-defined step rendered by its own snippet. */
let { runtime }: { runtime: PrototypeRuntime } = $props();

const steps: OnboardingUiStep[] = [
  {
    id: 'goal',
    label: 'Your goal',
    schema: z.object({ goal: z.enum(['ship', 'learn'], 'Pick a goal') }),
  },
];
</script>

{#snippet goal({ values, issues, setValue }: OnboardingStepSnippetArgs)}
  <fieldset>
    <legend>What brings you here?</legend>
    <label><input type="radio" name="goal" checked={values.goal === 'ship'} onchange={() => setValue('goal', 'ship')} /> Ship faster</label>
    <label><input type="radio" name="goal" checked={values.goal === 'learn'} onchange={() => setValue('goal', 'learn')} /> Learn</label>
    {#if issues.goal}<p data-testid="goal-error">{issues.goal}</p>{/if}
  </fieldset>
{/snippet}

<OnboardingHarness {runtime} {steps} snippets={{ goal }} />
