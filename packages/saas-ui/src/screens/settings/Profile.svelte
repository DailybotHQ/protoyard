<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { avatarImage, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { createSettingsServices } from '@protoyard/saas';
import { Avatar } from '@protoyard/ui';
import { SchemaForm, type SchemaFormSubmission } from '@texuli/forms';
import { getSaas } from '../../context.ts';
import { compileKitForm, kitSubmitResult, text } from '../../lib/schema-form.ts';

const runtime = getSaas().runtime as Parameters<typeof createSettingsServices>[0];
const settings = createSettingsServices(runtime);
const principal = usePrincipal(runtime as PrototypeRuntime);
const allowed = $derived(runtime.session.can('profile:update'));

// Painted by @texuli/forms (the avatar color is its color picker); the settings service validates and saves.
const form = compileKitForm({
  title: 'Profile details',
  submitLabel: 'Save profile',
  fields: [
    { name: 'name', type: 'text', label: 'Display name', required: true, autocomplete: 'name' },
    {
      name: 'avatarColor',
      type: 'color',
      label: 'Avatar color',
      description: 'A solid color used by this profile.',
    },
    {
      name: 'timezone',
      type: 'text',
      label: 'Time zone',
      required: true,
      placeholder: 'America/Bogota',
      description: 'Used for local dates and reminders.',
    },
  ],
});
// Read once: the form starts from the saved profile and keeps what is typed.
const values = {
  name: principal.current?.persona.name ?? '',
  avatarColor: principal.current?.persona.avatarColor ?? '#6366f1',
  timezone: principal.current?.persona.timezone ?? 'UTC',
};

async function save({ values: answer }: SchemaFormSubmission) {
  const result = await runService(() =>
    settings.updateProfile({
      name: text(answer, 'name'),
      timezone: text(answer, 'timezone'),
      avatarColor: text(answer, 'avatarColor') || values.avatarColor,
    })
  );
  return kitSubmitResult(result, form, 'Could not save the profile.');
}
</script>

<section class="grid gap-5" aria-labelledby="settings-profile-title" data-testid="settings-profile">
  <div class="flex items-center gap-4">
    {#if principal.current}
      <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="lg" data-testid="settings-profile-avatar" />
    {/if}
    <div>
      <h2 id="settings-profile-title" class="text-lg font-semibold">Profile</h2>
      <p class="text-sm text-muted-foreground">Update the simulated profile used in this prototype.</p>
    </div>
  </div>
  {#if !allowed}<p class="text-sm text-muted-foreground">Your simulated role cannot edit profile settings.</p>{/if}
  <SchemaForm
    {form}
    {values}
    onSubmit={save}
    labels={{ submitted: 'Profile saved.', submitting: 'Saving profile' }}
    aria-label="Profile settings"
    class="max-w-xl py-saas-form"
    data-py-saas-form="profile"
    disabled={!allowed}
    hideTitle
  />
</section>
