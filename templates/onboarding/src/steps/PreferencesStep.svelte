<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { FormField, RadioGroup, Select, Switch } from '@protoyard/ui';
import StepFooter from '../components/StepFooter.svelte';
import StepHeading from '../components/StepHeading.svelte';
import {
  type ColorModeChoice,
  DIGESTS,
  type Digest,
  type OnboardingState,
} from '../database/schema.ts';
import { useOnboarding } from '../lib/context.ts';
import { DIGEST_LABELS } from '../lib/format.ts';

let { flow, onBack, onSkip }: { flow: OnboardingState; onBack: () => void; onSkip: () => void } =
  $props();
const { services, runtime } = useOnboarding();

// svelte-ignore state_referenced_locally
const saved = flow.preferences;
let form = $state({
  mode: (saved?.mode ?? runtime.theme.appearance().mode.value) as string,
  digest: (saved?.digest ?? 'weekly') as string,
  productUpdates: saved?.productUpdates ?? true,
  mentions: saved?.mentions ?? true,
});
let errors = $state<Record<string, string>>({});
let busy = $state(false);

async function submit(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  const result = await runService(() =>
    services.savePreferences({
      ...form,
      mode: form.mode as ColorModeChoice,
      digest: form.digest as Digest,
    })
  );
  busy = false;
  if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
}
</script>

<StepHeading title="Make it yours" optional description="Pick how the app looks and how often we nudge you. Change these any time." />

<form id="step-preferences" class="space-y-6" onsubmit={submit} novalidate>
  <FormField label="Appearance" required error={errors.mode}>
    {#snippet children(control)}
      <RadioGroup
        {...control.props}
        orientation="horizontal"
        class="flex flex-wrap gap-4"
        bind:value={form.mode}
        items={[
          { value: 'system', label: 'Match system' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    {/snippet}
  </FormField>
  <FormField label="Email digest" required error={errors.digest} description="A summary of what changed in your workspace.">
    {#snippet children(control)}
      <Select {...control.props} class="sm:w-64" items={DIGESTS.map((d) => ({ value: d, label: DIGEST_LABELS[d] ?? d }))} bind:value={form.digest} />
    {/snippet}
  </FormField>
  <fieldset class="space-y-3">
    <legend class="mb-2 text-sm font-medium">Notifications</legend>
    <Switch label="Mentions and replies" description="When someone mentions you or replies to you." bind:checked={form.mentions} />
    <Switch label="Product updates" description="New features and tips, about once a month." bind:checked={form.productUpdates} />
  </fieldset>
</form>

<StepFooter form="step-preferences" {busy} {onBack} {onSkip} submitLabel="Save preferences" />
