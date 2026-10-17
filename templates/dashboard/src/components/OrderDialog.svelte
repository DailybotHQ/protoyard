<script lang="ts">
import { isValidationError, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { useDashboard } from '../lib/context.ts';

/**
 * New order. Pass `customerId` to lock the customer (from a detail page);
 * otherwise the dialog shows a customer picker.
 */
let { open = $bindable(false), customerId = null }: { open?: boolean; customerId?: string | null } =
  $props();

const { db, services, settings } = useDashboard();
const customers = liveQuery(() => db.customers.orderBy('name').toArray(), { initial: [] });
let form = $state({ customerId: '', description: '', amount: '' });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
const currency = $derived(settings.current?.currency ?? 'USD');

$effect(() => {
  if (open) {
    form = { customerId: customerId ?? '', description: '', amount: '' };
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => services.orders.create(form), {
    success: 'Order created',
  });
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="New order" description="New orders start as Pending. Change the status from any order list.">
  <form id="order-form" class="space-y-4" onsubmit={submit} novalidate>
    {#if !customerId}
      <FormField label="Customer" required error={errors.customerId}>
        {#snippet children(control)}
          <Select
            {...control.props}
            placeholder={(customers.current ?? []).length ? 'Pick a customer' : 'Add a customer first'}
            items={(customers.current ?? []).map((c) => ({ value: c.id, label: c.company ? `${c.name} · ${c.company}` : c.name }))}
            bind:value={form.customerId}
          />
        {/snippet}
      </FormField>
    {/if}
    <FormField label="Description" required error={errors.description}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.description} placeholder="Annual subscription" autocomplete="off" maxlength={120} />
      {/snippet}
    </FormField>
    <FormField label={`Amount (${currency})`} required error={errors.amount}>
      {#snippet children(control)}
        <Input {...control.props} type="number" min="0" step="0.01" inputmode="decimal" bind:value={form.amount} placeholder="499" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="order-form" loading={saving}>Create order</Button>
  {/snippet}
</Dialog>
