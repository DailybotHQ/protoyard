<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { PatientInput } from '../domain/validation.ts';
import { useClinic } from '../lib/context.ts';

/**
 * Registers a fictional patient, or edits one (`patientId` set). The inputs
 * only accept obviously fictional contacts; sensitive fields are marked.
 */
let {
  open = $bindable(false),
  patientId,
  initial,
}: { open?: boolean; patientId?: string; initial?: PatientInput | null } = $props();

const { services } = useClinic();
const EMPTY: Required<PatientInput> = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  phone: '',
  allergies: '',
  insuranceId: '',
};
let form = $state<Required<PatientInput>>({ ...EMPTY });
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (!open) return;
  form = { ...EMPTY, ...(initial ?? {}) };
  errors = {};
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const id = patientId;
  const result = await runService(
    () => (id ? services.patients.update(id, form) : services.patients.create(form)),
    { success: id ? 'Patient updated' : 'Patient registered' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!id) navigate(`/patients/${result.value.id}`);
  } else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title={patientId ? 'Edit patient' : 'Register patient'} description="Fictional data only. Fields marked sensitive are masked on screen and redacted from the audit log." size="lg">
  <form id="patient-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="First name" required error={errors.firstName}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.firstName} autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
    <FormField label="Last name" required error={errors.lastName}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.lastName} autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
    <FormField label="Date of birth (sensitive)" required error={errors.dateOfBirth}>
      {#snippet children(control)}
        <Input {...control.props} type="date" bind:value={form.dateOfBirth} />
      {/snippet}
    </FormField>
    <FormField label="Email" required error={errors.email} description="@example.com only.">
      {#snippet children(control)}
        <Input {...control.props} type="email" bind:value={form.email} placeholder="ada@example.com" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Phone (sensitive)" required error={errors.phone} description="Fictional numbers only: +1 555-01xx.">
      {#snippet children(control)}
        <Input {...control.props} type="tel" bind:value={form.phone} placeholder="+1 555-0142" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Insurance id (sensitive)" error={errors.insuranceId} description="Fictional: SIM- and six digits, or empty.">
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.insuranceId} placeholder="SIM-123456" autocomplete="off" />
      {/snippet}
    </FormField>
    <div class="sm:col-span-2">
      <FormField label="Allergies (sensitive)" error={errors.allergies}>
        {#snippet children(control)}
          <Input {...control.props} bind:value={form.allergies} placeholder="None known" autocomplete="off" maxlength={200} />
        {/snippet}
      </FormField>
    </div>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="patient-form" loading={saving}>{patientId ? 'Save changes' : 'Register patient'}</Button>
  {/snippet}
</Dialog>
