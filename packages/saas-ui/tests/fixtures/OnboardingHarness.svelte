<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { untrack } from 'svelte';
import { provideSaas } from '../../src/context.ts';
import OnboardingWizard, {
  type OnboardingStepSnippet,
} from '../../src/screens/onboarding/OnboardingWizard.svelte';
import type { OnboardingUiStep } from '../../src/screens/onboarding/steps.ts';

/** Real runtime in the kit context, then the wizard (as the `/onboarding` route renders it). */
let {
  runtime,
  steps,
  snippets,
  onComplete,
}: {
  runtime: PrototypeRuntime;
  steps?: OnboardingUiStep[];
  snippets?: Record<string, OnboardingStepSnippet>;
  onComplete?: () => void;
} = $props();

provideSaas(untrack(() => runtime));
</script>

<OnboardingWizard {...steps ? { steps } : {}} {...snippets ? { snippets } : {}} {...onComplete ? { onComplete } : {}} />
