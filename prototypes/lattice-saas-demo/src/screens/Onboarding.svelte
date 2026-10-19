<script lang="ts">
import { getRuntime } from '@protoyard/renderer-svelte';
import { OnboardingWizard } from '@protoyard/saas-ui';
import { latticeOnboardingSteps } from '../domain/onboarding.ts';

/**
 * `/onboarding`: the kit wizard with the Lattice steps, whose data changes
 * commit in the same transaction as each step's answer.
 */
const runtime = getRuntime();
const steps = latticeOnboardingSteps(runtime);
</script>

<OnboardingWizard {steps} title="Set up your Lattice workspace" />
