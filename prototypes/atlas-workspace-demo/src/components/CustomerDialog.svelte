<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { CUSTOMER_STATUSES, type Customer, PLANS } from '../database/schema.ts';
import { useDashboard } from '../lib/context.ts';

/** Create (no `customer`) or edit dialog. Validation errors render inline; others toast. */
let { open = $bindable(false), customer = null }: { open?: boolean; customer?: Customer | null } =
  $props();

const { services } = useDashboard();
let form = $state(initial());
let errors = $state<Record<string, string>>({});
let saving = $state(false);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Reset the form each time the dialog opens.
$effect(() => {
  if (open) {
    form = initial();
    errors = {};
  }
});

function initial() {
  return {
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    company: customer?.company ?? '',
    plan: customer?.plan ?? 'starter',
    status: customer?.status ?? 'trial',
    country: customer?.country ?? '',
  };
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const input = {
    ...form,
    plan: form.plan as Customer['plan'],
    status: form.status as Customer['status'],
  };
  const result = await runService<unknown>(
    () =>
      customer ? services.customers.update(customer.id, input) : services.customers.create(input),
    { success: customer ? 'Customer updated' : 'Customer created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!customer && result.value) navigate(`/customers/${(result.value as Customer).id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}
</script>

<Dialog bind:open title={customer ? 'Edit customer' : 'New customer'} description="Saved in this browser's IndexedDB." size="lg">
  <form id="customer-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Full name" required error={errors.name}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.name} placeholder="Ada Lovelace" autocomplete="off" maxlength={80} />
      {/snippet}
    </FormField>
    <FormField label="Email" required error={errors.email}>
      {#snippet children(control)}
        <Input {...control.props} type="email" bind:value={form.email} placeholder="ada@example.com" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Company" error={errors.company}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.company} placeholder="Analytical Engines Ltd." autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Country" error={errors.country}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.country} placeholder="United Kingdom" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Plan" required error={errors.plan}>
      {#snippet children(control)}
        <Select {...control.props} items={PLANS.map((p) => ({ value: p, label: capitalize(p) }))} bind:value={form.plan} />
      {/snippet}
    </FormField>
    <FormField label="Status" required error={errors.status}>
      {#snippet children(control)}
        <Select {...control.props} items={CUSTOMER_STATUSES.map((s) => ({ value: s, label: capitalize(s) }))} bind:value={form.status} />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="customer-form" loading={saving}>{customer ? 'Save changes' : 'Create customer'}</Button>
  {/snippet}
</Dialog>
