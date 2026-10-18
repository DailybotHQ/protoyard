<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, usePrincipal } from '@protoyard/renderer-svelte';
import { createSettingsServices } from '@protoyard/saas';
import { Button, FormField, Input } from '@protoyard/ui';
import { getSaas } from '../../context.ts';

const runtime = getSaas().runtime as Parameters<typeof createSettingsServices>[0];
const settings = createSettingsServices(runtime);
const principal = usePrincipal(runtime as PrototypeRuntime);
let name = $state(principal.current?.persona.name ?? '');
let timezone = $state(principal.current?.persona.timezone ?? 'UTC');
let avatarColor = $state(principal.current?.persona.avatarColor ?? '#6366f1');
let busy = $state(false);
let message = $state('');

const allowed = $derived(runtime.session.can('profile:update'));

async function save(): Promise<void> {
  if (busy) return;
  busy = true;
  message = '';
  const result = await runService(() => settings.updateProfile({ name, timezone, avatarColor }));
  busy = false;
  message = result.ok
    ? 'Profile saved.'
    : result.error instanceof Error
      ? result.error.message
      : 'Could not save the profile.';
}
</script>

<section class="grid gap-5" aria-labelledby="settings-profile-title" data-testid="settings-profile">
  <div>
    <h2 id="settings-profile-title" class="text-lg font-semibold">Profile</h2>
    <p class="text-sm text-muted-foreground">Update the simulated profile used in this prototype.</p>
  </div>
  <form class="grid max-w-xl gap-4" onsubmit={(event) => { event.preventDefault(); void save(); }}>
    <FormField label="Display name" required>
      {#snippet children(control)}<Input {...control.props} bind:value={name} autocomplete="name" required disabled={!allowed || busy} />{/snippet}
    </FormField>
    <FormField label="Avatar color" description="A solid color used by this profile.">
      {#snippet children(control)}<Input {...control.props} type="color" bind:value={avatarColor} disabled={!allowed || busy} />{/snippet}
    </FormField>
    <FormField label="Time zone" required description="Used for local dates and reminders.">
      {#snippet children(control)}<Input {...control.props} bind:value={timezone} placeholder="America/Bogota" required disabled={!allowed || busy} />{/snippet}
    </FormField>
    {#if !allowed}<p class="text-sm text-muted-foreground">Your simulated role cannot edit profile settings.</p>{/if}
    {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
    <Button type="submit" disabled={!allowed || busy} loading={busy} loadingLabel="Saving profile">Save profile</Button>
  </form>
</section>
