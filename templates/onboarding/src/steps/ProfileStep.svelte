<script lang="ts">
import { isValidationError, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { FormField, Input, Select } from '@protoyard/ui';
import StepFooter from '../components/StepFooter.svelte';
import StepHeading from '../components/StepHeading.svelte';
import { DEPARTMENTS, type OnboardingState, TIMEZONES } from '../database/schema.ts';
import { useOnboarding } from '../lib/context.ts';
import { timezoneLabel } from '../lib/format.ts';

let { flow }: { flow: OnboardingState } = $props();
const { services } = useOnboarding();
const principal = usePrincipal();

// Prefill from earlier answers, then from the persona.
// svelte-ignore state_referenced_locally
const saved = flow.profile;
let form = $state({
  fullName: saved?.fullName ?? principal.current?.persona.name ?? '',
  jobTitle: saved?.jobTitle ?? principal.current?.persona.title ?? '',
  department: saved?.department ?? '',
  timezone: saved?.timezone ?? '',
});
let errors = $state<Record<string, string>>({});
let busy = $state(false);

async function submit(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  const result = await runService(() =>
    services.saveProfile({ ...form, department: form.department as (typeof DEPARTMENTS)[number] })
  );
  busy = false;
  if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
}
</script>

<StepHeading title="Tell us about you" description="This is how teammates will see you. You can change it later." />

<form id="step-profile" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
  <FormField label="Full name" required error={errors.fullName} class="sm:col-span-2">
    {#snippet children(control)}
      <Input {...control.props} bind:value={form.fullName} autocomplete="name" maxlength={60} />
    {/snippet}
  </FormField>
  <FormField label="Job title" error={errors.jobTitle} description="Optional">
    {#snippet children(control)}
      <Input {...control.props} bind:value={form.jobTitle} autocomplete="organization-title" placeholder="Product designer" maxlength={60} />
    {/snippet}
  </FormField>
  <FormField label="Team" required error={errors.department}>
    {#snippet children(control)}
      <Select {...control.props} placeholder="Pick your team" items={DEPARTMENTS.map((d) => ({ value: d, label: d }))} bind:value={form.department} />
    {/snippet}
  </FormField>
  <FormField label="Time zone" required error={errors.timezone} class="sm:col-span-2" description="Used for reminders and digests.">
    {#snippet children(control)}
      <Select {...control.props} placeholder="Pick your time zone" items={TIMEZONES.map((tz) => ({ value: tz, label: timezoneLabel(tz) }))} bind:value={form.timezone} />
    {/snippet}
  </FormField>
</form>

<StepFooter form="step-profile" {busy} />
