<script lang="ts">
import { isValidationError, liveQuery, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { DEAL_STAGES, type Deal, type DealStage } from '../database/schema.ts';
import { STAGE_LABELS } from '../domain/services.ts';
import { useCrm } from '../lib/context.ts';
import { toDateInput } from '../lib/format.ts';

/**
 * Create or edit a deal. Field errors come back from the service's zod
 * validation (`ValidationError.issues`) and render inline; permission and
 * network failures become toasts via `runService`.
 */
let {
  open = $bindable(false),
  deal = null,
  companyId = '',
  stage = 'lead',
  openAfterCreate = true,
}: {
  open?: boolean;
  deal?: Deal | null;
  companyId?: string;
  stage?: DealStage;
  openAfterCreate?: boolean;
} = $props();

const { db, services, runtime } = useCrm();
const companies = liveQuery(() => db.companies.orderBy('name').toArray(), { initial: [] });
const people = liveQuery(
  () => db.table('py_personas').toArray() as Promise<{ id: string; name: string }[]>,
  { initial: [] }
);

let form = $state(blank());
let errors = $state<Record<string, string>>({});
let saving = $state(false);

// Reset the form every time the dialog opens.
$effect(() => {
  if (open) {
    form = blank();
    errors = {};
  }
});

const contacts = liveQuery(
  () => (form.companyId ? db.contacts.where('companyId').equals(form.companyId).toArray() : []),
  { initial: [], deps: () => form.companyId }
);

function blank() {
  const defaultClose = new Date(runtime.clock.nowMs() + 30 * 86_400_000).toISOString();
  return {
    title: deal?.title ?? '',
    companyId: deal?.companyId ?? companyId,
    contactId: deal?.contactId ?? '',
    ownerId: deal?.ownerId ?? runtime.session.principal()?.persona.id ?? '',
    stage: (deal?.stage ?? stage) as DealStage,
    amount: deal ? String(deal.amount) : '',
    closeDate: toDateInput(deal?.closeDate ?? defaultClose),
  };
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  errors = {};
  const input = {
    title: form.title,
    companyId: form.companyId,
    contactId: form.contactId || null,
    ownerId: form.ownerId || undefined,
    stage: form.stage,
    amount: form.amount,
    closeDate: form.closeDate,
  };
  const result = await runService<unknown>(
    () => (deal ? services.deals.update(deal.id, input) : services.deals.create(input)),
    { success: deal ? 'Deal updated' : 'Deal created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!deal && openAfterCreate && result.value) navigate(`/deals/${(result.value as Deal).id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}

const stageItems = DEAL_STAGES.map((value) => ({ value, label: STAGE_LABELS[value] }));
</script>

<Dialog
  bind:open
  title={deal ? 'Edit deal' : 'New deal'}
  description={deal ? 'Changes are saved to this browser.' : 'Add an opportunity to the pipeline.'}
  size="lg"
>
  <form id="deal-form" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Title" required error={errors.title} class="sm:col-span-2">
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.title} placeholder="e.g. Acme — Annual plan" autocomplete="off" />
      {/snippet}
    </FormField>

    <FormField label="Company" required error={errors.companyId}>
      {#snippet children(control)}
        <Select
          {...control.props}
          items={(companies.current ?? []).map((c) => ({ value: c.id, label: c.name }))}
          bind:value={form.companyId}
          placeholder={(companies.current ?? []).length ? 'Choose a company' : 'Create a company first'}
          onValueChange={() => (form.contactId = '')}
        />
      {/snippet}
    </FormField>

    <FormField label="Primary contact" description="Optional" error={errors.contactId}>
      {#snippet children(control)}
        <Select
          {...control.props}
          items={[
            { value: '', label: 'No contact' },
            ...(contacts.current ?? []).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
          ]}
          bind:value={form.contactId}
          disabled={!form.companyId}
        />
      {/snippet}
    </FormField>

    <FormField label="Amount (USD)" required error={errors.amount}>
      {#snippet children(control)}
        <Input {...control.props} type="number" inputmode="numeric" min="0" step="500" bind:value={form.amount} placeholder="25000" />
      {/snippet}
    </FormField>

    <FormField label="Expected close" required error={errors.closeDate}>
      {#snippet children(control)}
        <Input {...control.props} type="date" bind:value={form.closeDate} />
      {/snippet}
    </FormField>

    <FormField label="Stage" error={errors.stage}>
      {#snippet children(control)}
        <Select {...control.props} items={stageItems} bind:value={form.stage} />
      {/snippet}
    </FormField>

    <FormField label="Owner" error={errors.ownerId}>
      {#snippet children(control)}
        <Select
          {...control.props}
          items={(people.current ?? []).map((p) => ({ value: p.id, label: p.name }))}
          bind:value={form.ownerId}
        />
      {/snippet}
    </FormField>
  </form>

  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="deal-form" loading={saving}>{deal ? 'Save changes' : 'Create deal'}</Button>
  {/snippet}
</Dialog>
