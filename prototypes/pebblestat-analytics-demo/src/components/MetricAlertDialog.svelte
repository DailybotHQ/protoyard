<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { ALERT_OPERATORS, type AlertOperator, EVENT_TYPES } from '../database/schema.ts';
import { EVENT_LABELS } from '../domain/catalog.ts';
import { useAnalytics } from '../lib/context.ts';

/** Creates a daily threshold alert (named apart from the ui AlertDialog confirmation). */
let { open = $bindable(false), projectId }: { open?: boolean; projectId: string } = $props();

const { services } = useAnalytics();
let form = $state({
  name: '',
  eventType: 'signup' as string,
  operator: 'below' as string,
  threshold: '',
});
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    form = { name: '', eventType: 'signup', operator: 'below', threshold: '' };
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () =>
      services.alerts.create({
        projectId,
        name: form.name,
        eventType: form.eventType as (typeof EVENT_TYPES)[number],
        operator: form.operator as AlertOperator,
        threshold: form.threshold,
      }),
    { success: 'Alert created' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="New alert" description="Checked once a day as simulated time advances (DevTools → Time).">
  <form id="alert-form" class="grid gap-4" onsubmit={submit} novalidate>
    <FormField label="Name" required error={errors.name}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.name} placeholder="Signups dropped" autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
    <FormField label="Event" required error={errors.eventType}>
      {#snippet children(control)}
        <Select {...control.props} items={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] ?? t }))} bind:value={form.eventType} />
      {/snippet}
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField label="When the daily count is" required error={errors.operator}>
        {#snippet children(control)}
          <Select {...control.props} items={ALERT_OPERATORS.map((o) => ({ value: o, label: o === 'above' ? 'Above' : 'Below' }))} bind:value={form.operator} />
        {/snippet}
      </FormField>
      <FormField label="Threshold (events per day)" required error={errors.threshold}>
        {#snippet children(control)}
          <Input {...control.props} type="number" inputmode="numeric" min="0" step="1" bind:value={form.threshold} />
        {/snippet}
      </FormField>
    </div>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="alert-form" loading={saving}>Create alert</Button>
  {/snippet}
</Dialog>
