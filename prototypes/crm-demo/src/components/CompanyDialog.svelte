<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { type Company, INDUSTRIES } from '../database/schema.ts';
import { useCrm } from '../lib/context.ts';

let { open = $bindable(false), company = null }: { open?: boolean; company?: Company | null } =
  $props();

const { services } = useCrm();
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
    name: company?.name ?? '',
    industry: company?.industry ?? 'Software',
    employees: company ? String(company.employees) : '',
    domain: company?.domain ?? '',
    city: company?.city ?? '',
    tags: company?.tags.join(', ') ?? '',
  };
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const input = {
    ...form,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const result = await runService<unknown>(
    () =>
      company ? services.companies.update(company.id, input) : services.companies.create(input),
    { success: company ? 'Company updated' : 'Company created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!company && result.value) navigate(`/companies/${(result.value as Company).id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}
</script>

<Dialog bind:open title={company ? 'Edit company' : 'New company'} size="lg">
  <form id="company-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Name" required error={errors.name} class="sm:col-span-2">
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.name} placeholder="Acme Robotics" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Website domain" required description="Fictional domains only, e.g. acme.example" error={errors.domain}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.domain} placeholder="acme.example" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Industry" required error={errors.industry}>
      {#snippet children(control)}
        <Select {...control.props} items={INDUSTRIES.map((i) => ({ value: i, label: i }))} bind:value={form.industry} />
      {/snippet}
    </FormField>
    <FormField label="Employees" required error={errors.employees}>
      {#snippet children(control)}
        <Input {...control.props} type="number" min="1" inputmode="numeric" bind:value={form.employees} />
      {/snippet}
    </FormField>
    <FormField label="City" error={errors.city}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.city} />
      {/snippet}
    </FormField>
    <FormField label="Tags" description="Comma separated" error={errors.tags} class="sm:col-span-2">
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.tags} placeholder="enterprise, inbound" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="company-form" loading={saving}>{company ? 'Save changes' : 'Create company'}</Button>
  {/snippet}
</Dialog>
