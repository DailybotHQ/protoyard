<script lang="ts">
import { isValidationError, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import type { Contact } from '../database/schema.ts';
import { useCrm } from '../lib/context.ts';

let {
  open = $bindable(false),
  contact = null,
  companyId = '',
}: { open?: boolean; contact?: Contact | null; companyId?: string } = $props();

const { db, services } = useCrm();
const companies = liveQuery(() => db.companies.orderBy('name').toArray(), { initial: [] });
let form = $state(blank());
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    form = blank();
    errors = {};
  }
});

function blank() {
  return {
    companyId: contact?.companyId ?? companyId,
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    title: contact?.title ?? '',
  };
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService<unknown>(
    () => (contact ? services.contacts.update(contact.id, form) : services.contacts.create(form)),
    { success: contact ? 'Contact updated' : 'Contact added' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title={contact ? 'Edit contact' : 'New contact'} size="lg">
  <form id="contact-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="First name" required error={errors.firstName}>
      {#snippet children(control)}<Input {...control.props} bind:value={form.firstName} autocomplete="off" />{/snippet}
    </FormField>
    <FormField label="Last name" required error={errors.lastName}>
      {#snippet children(control)}<Input {...control.props} bind:value={form.lastName} autocomplete="off" />{/snippet}
    </FormField>
    <FormField label="Email" required description="Use example.com addresses (demo data)" error={errors.email}>
      {#snippet children(control)}<Input {...control.props} type="email" bind:value={form.email} autocomplete="off" />{/snippet}
    </FormField>
    <FormField label="Phone" error={errors.phone}>
      {#snippet children(control)}<Input {...control.props} type="tel" bind:value={form.phone} autocomplete="off" />{/snippet}
    </FormField>
    <FormField label="Job title" error={errors.title}>
      {#snippet children(control)}<Input {...control.props} bind:value={form.title} />{/snippet}
    </FormField>
    <FormField label="Company" required error={errors.companyId}>
      {#snippet children(control)}
        <Select
          {...control.props}
          items={(companies.current ?? []).map((c) => ({ value: c.id, label: c.name }))}
          bind:value={form.companyId}
          placeholder="Choose a company"
        />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="contact-form" loading={saving}>{contact ? 'Save changes' : 'Add contact'}</Button>
  {/snippet}
</Dialog>
