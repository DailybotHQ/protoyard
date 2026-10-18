<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import {
  createMfaServices,
  createSettingsServices,
  type MfaServices,
  type SaasAccount,
} from '@protoyard/saas';
import { Button, FormField, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../../context.ts';

const { runtime, config } = getSaas();
const service = createSettingsServices(runtime as Parameters<typeof createSettingsServices>[0]);
const mfa = createMfaServices(runtime as Parameters<typeof createMfaServices>[0]);
type Enrollment = Awaited<ReturnType<MfaServices['enroll']>>;
let account = $state<SaasAccount | null>(null);
let mfaStatus = $state<'none' | 'pending' | 'active'>('none');
let enrollment = $state<Enrollment | null>(null);
let currentPassword = $state('');
let newPassword = $state('');
let confirmationCode = $state('');
let busy = $state(false);
let message = $state('');
const allowed = $derived(runtime.session.can('settings:security'));

async function refresh(): Promise<void> {
  const result = await runService(() => service.account());
  if (result.ok) account = result.value;
  try {
    mfaStatus = await mfa.status();
  } catch {
    /* service error shown by the action that caused it */
  }
}

async function changePassword(): Promise<void> {
  if (busy) return;
  busy = true;
  message = '';
  const result = await runService(() => service.changePassword({ currentPassword, newPassword }));
  busy = false;
  message = result.ok
    ? 'Simulated password changed.'
    : result.error instanceof Error
      ? result.error.message
      : 'Could not change the password.';
  if (result.ok) {
    currentPassword = '';
    newPassword = '';
  }
}

async function beginMfa(): Promise<void> {
  if (busy) return;
  busy = true;
  message = '';
  const result = await runService(() => service.enrollMfa());
  busy = false;
  if (result.ok) enrollment = result.value;
  else
    message =
      result.error instanceof Error
        ? result.error.message
        : 'Could not begin simulated MFA enrollment.';
}

async function confirmMfa(): Promise<void> {
  if (!enrollment || busy) return;
  busy = true;
  message = '';
  const result = await runService(() => service.confirmMfaEnrollment(confirmationCode));
  busy = false;
  if (result.ok) {
    mfaStatus = 'active';
    enrollment = null;
    confirmationCode = '';
    message = 'Simulated MFA enabled.';
  } else
    message =
      result.error instanceof Error ? result.error.message : 'Could not enable simulated MFA.';
}

async function signOut(): Promise<void> {
  if (busy) return;
  busy = true;
  const result = await runService(() => service.signOutEverywhere());
  busy = false;
  if (result.ok) navigate(config.signInPath);
  else message = result.error instanceof Error ? result.error.message : 'Could not sign out.';
}

onMount(() => {
  void refresh();
});
</script>

<section class="grid gap-6" aria-labelledby="settings-security-title" data-testid="settings-security">
  <div>
    <h2 id="settings-security-title" class="text-lg font-semibold">Security</h2>
    <p class="text-sm text-muted-foreground">These controls change the simulated account in this browser prototype.</p>
  </div>
  <form class="grid max-w-xl gap-4" onsubmit={(event) => { event.preventDefault(); void changePassword(); }}>
    <h3 class="font-medium">Change password</h3>
    <FormField label="Current simulated password" required>
      {#snippet children(control)}<Input {...control.props} type="password" autocomplete="current-password" bind:value={currentPassword} required disabled={!allowed || busy} />{/snippet}
    </FormField>
    <FormField label="New simulated password" required>
      {#snippet children(control)}<Input {...control.props} type="password" autocomplete="new-password" bind:value={newPassword} minlength={8} required disabled={!allowed || busy} />{/snippet}
    </FormField>
    <Button type="submit" disabled={!allowed || busy} loading={busy} loadingLabel="Changing password">Change password</Button>
  </form>
  <div class="grid max-w-xl gap-3">
    <h3 class="font-medium">Multi-factor authentication</h3>
    <p class="text-sm text-muted-foreground">Status: {mfaStatus === 'active' ? 'enabled' : mfaStatus === 'pending' ? 'setup pending' : 'not enabled'}. Codes are simulated and are not real TOTP.</p>
    {#if enrollment}
      <div class="grid gap-3 rounded-md border border-border p-4">
        <p role="note">Simulated authenticator code: <strong class="font-mono">{enrollment.currentCode}</strong></p>
        <FormField label="Enter the code to confirm enrollment" required>
          {#snippet children(control)}<Input {...control.props} inputmode="numeric" bind:value={confirmationCode} maxlength={6} required disabled={busy} />{/snippet}
        </FormField>
        <Button disabled={!allowed || busy} onclick={() => void confirmMfa()}>Confirm MFA</Button>
      </div>
    {:else if mfaStatus !== 'active'}
      <Button variant="outline" disabled={!allowed || busy} onclick={() => void beginMfa()}>Set up simulated MFA</Button>
    {/if}
  </div>
  <div class="grid max-w-xl gap-2">
    <h3 class="font-medium">Linked providers</h3>
    {#if account?.providers.length}
      <ul class="list-inside list-disc text-sm">{#each account.providers as linked (linked.provider)}<li>{linked.provider} · linked {new Date(linked.linkedAt).toLocaleDateString()}</li>{/each}</ul>
    {:else}<p class="text-sm text-muted-foreground">No providers are linked to this simulated account.</p>{/if}
  </div>
  {#if !allowed}<p class="text-sm text-muted-foreground">Your simulated role cannot change security settings.</p>{/if}
  {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
  <div><Button variant="destructive" disabled={!allowed || busy} onclick={() => void signOut()}>Sign out</Button><p class="mt-1 text-xs text-muted-foreground">This ends the active simulated session. The prototype does not model sessions on other tabs or devices.</p></div>
</section>
