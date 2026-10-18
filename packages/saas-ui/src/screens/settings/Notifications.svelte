<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import {
  createSettingsServices,
  DEFAULT_SAAS_NOTIFICATION_PREFERENCES,
  type SaasNotificationPreferences,
} from '@protoyard/saas';
import { Button } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../../context.ts';

const runtime = getSaas().runtime as Parameters<typeof createSettingsServices>[0];
const service = createSettingsServices(runtime);
let preferences = $state<SaasNotificationPreferences>({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
let busy = $state(false);
let message = $state('');
const allowed = $derived(runtime.session.can('settings:notifications'));

onMount(() => {
  void runService(() => service.notificationPreferences()).then((result) => {
    if (result.ok) preferences = result.value;
    else
      message =
        result.error instanceof Error
          ? result.error.message
          : 'Could not load notification preferences.';
  });
});

async function save(): Promise<void> {
  if (busy) return;
  busy = true;
  message = '';
  const result = await runService(() => service.updateNotificationPreferences(preferences));
  busy = false;
  message = result.ok
    ? 'Notification preferences saved.'
    : result.error instanceof Error
      ? result.error.message
      : 'Could not save notification preferences.';
}
</script>

<section class="grid gap-5" aria-labelledby="settings-notifications-title" data-testid="settings-notifications">
  <div>
    <h2 id="settings-notifications-title" class="text-lg font-semibold">Notifications</h2>
    <p class="text-sm text-muted-foreground">Choose which simulated inbox notifications this account receives.</p>
  </div>
  <form class="grid max-w-xl gap-4" onsubmit={(event) => { event.preventDefault(); void save(); }}>
    <label class="flex items-start gap-3"><input type="checkbox" bind:checked={preferences.productUpdates} disabled={!allowed || busy} /><span><span class="block font-medium">Product updates</span><span class="text-sm text-muted-foreground">Occasional product news in the simulated inbox.</span></span></label>
    <label class="flex items-start gap-3"><input type="checkbox" bind:checked={preferences.securityAlerts} disabled={!allowed || busy} /><span><span class="block font-medium">Security alerts</span><span class="text-sm text-muted-foreground">Sign-in and account changes in the simulated inbox.</span></span></label>
    <label class="flex items-start gap-3"><input type="checkbox" bind:checked={preferences.workspaceActivity} disabled={!allowed || busy} /><span><span class="block font-medium">Workspace activity</span><span class="text-sm text-muted-foreground">Invitations and workspace updates in the simulated inbox.</span></span></label>
    {#if !allowed}<p class="text-sm text-muted-foreground">Your simulated role cannot edit notification preferences.</p>{/if}
    {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
    <Button type="submit" disabled={!allowed || busy} loading={busy} loadingLabel="Saving preferences">Save preferences</Button>
  </form>
</section>
