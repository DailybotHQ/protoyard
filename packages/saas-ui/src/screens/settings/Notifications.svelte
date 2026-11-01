<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import {
  createSettingsServices,
  DEFAULT_SAAS_NOTIFICATION_PREFERENCES,
  type SaasNotificationPreferences,
} from '@protoyard/saas';
import { SchemaForm, type SchemaFormSubmission } from '@texuli/forms';
import { onMount } from 'svelte';
import { getSaas } from '../../context.ts';
import { compileKitForm, editableFields, kitSubmitResult } from '../../lib/schema-form.ts';

const runtime = getSaas().runtime as Parameters<typeof createSettingsServices>[0];
const service = createSettingsServices(runtime);
let preferences = $state<SaasNotificationPreferences>({ ...DEFAULT_SAAS_NOTIFICATION_PREFERENCES });
/** Bumped when stored preferences arrive, so the form starts over from them. */
let loaded = $state(0);
let message = $state('');
const allowed = $derived(runtime.session.can('settings:notifications'));

// Painted by @texuli/forms; the settings service validates and stores the answer.
const form = $derived(
  compileKitForm({
    title: 'Notification preferences',
    submitLabel: 'Save preferences',
    fields: editableFields(
      [
        {
          name: 'productUpdates',
          type: 'checkbox',
          label: 'Product updates',
          description: 'Occasional product news in the simulated inbox.',
        },
        {
          name: 'securityAlerts',
          type: 'checkbox',
          label: 'Security alerts',
          description: 'Sign-in and account changes in the simulated inbox.',
        },
        {
          name: 'workspaceActivity',
          type: 'checkbox',
          label: 'Workspace activity',
          description: 'Invitations and workspace updates in the simulated inbox.',
        },
      ],
      allowed
    ),
  })
);

onMount(() => {
  void runService(() => service.notificationPreferences()).then((result) => {
    if (result.ok) {
      preferences = result.value;
      loaded += 1;
    } else
      message =
        result.error instanceof Error
          ? result.error.message
          : 'Could not load notification preferences.';
  });
});

async function save({ values }: SchemaFormSubmission) {
  message = '';
  const next: SaasNotificationPreferences = {
    productUpdates: values.productUpdates === true,
    securityAlerts: values.securityAlerts === true,
    workspaceActivity: values.workspaceActivity === true,
  };
  const result = await runService(() => service.updateNotificationPreferences(next));
  if (result.ok) preferences = next;
  return kitSubmitResult(result, form, 'Could not save notification preferences.');
}
</script>

<section class="grid gap-5" aria-labelledby="settings-notifications-title" data-testid="settings-notifications">
  <div>
    <h2 id="settings-notifications-title" class="text-lg font-semibold">Notifications</h2>
    <p class="text-sm text-muted-foreground">Choose which simulated inbox notifications this account receives.</p>
  </div>
  {#if !allowed}<p class="text-sm text-muted-foreground">Your simulated role cannot edit notification preferences.</p>{/if}
  {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
  {#key loaded}
    <SchemaForm
      {form}
      values={preferences}
      onSubmit={save}
      labels={{ submitted: 'Notification preferences saved.', submitting: 'Saving preferences' }}
      aria-label="Notification preferences"
      class="py-saas-form"
      data-py-saas-form="notifications"
      inert={allowed ? undefined : true}
    />
  {/key}
</section>

<style>
  /* The section heading names the form; SchemaForm's own title stays its aria-label only. */
  :global(.py-saas-form .tx-forms__title) {
    display: none;
  }
</style>
