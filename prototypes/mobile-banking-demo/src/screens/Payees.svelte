<script lang="ts">
import { Plus, Send, Trash, Users } from '@lucide/svelte';
import { can, liveQuery } from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  toast,
} from '@protoyard/ui';
import Notice from '../components/Notice.svelte';
import Page from '../components/Page.svelte';
import type { Beneficiary } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { BeneficiaryInputSchema } from '../domain/services.ts';
import { useBank } from '../lib/context.ts';
import { describeError } from '../lib/errors.ts';
import { notifyError } from '../lib/feedback.ts';

const { db, services } = useBank();
const payees = liveQuery(() => db.beneficiaries.orderBy('name').toArray());

const canManage = $derived(can(CAPABILITIES.beneficiariesManage));
const canSend = $derived(can(CAPABILITIES.transfersCreate));

type Field = 'name' | 'nickname' | 'institution' | 'last4';
const empty = { name: '', nickname: '', institution: '', last4: '' };
let sheetOpen = $state(false);
let form = $state({ ...empty });
let errors = $state<Partial<Record<Field, string>>>({});
let formError = $state<string | null>(null);
let saving = $state(false);
let removing = $state<Beneficiary | null>(null);
let removeOpen = $state(false);

function openSheet() {
  form = { ...empty };
  errors = {};
  formError = null;
  sheetOpen = true;
}

async function save(event: SubmitEvent) {
  event.preventDefault();
  formError = null;
  const parsed = BeneficiaryInputSchema.safeParse(form);
  if (!parsed.success) {
    const next: Partial<Record<Field, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as Field;
      next[key] ??= issue.message;
    }
    errors = next;
    return;
  }
  errors = {};
  saving = true;
  try {
    const payee = await services.addBeneficiary(form);
    sheetOpen = false;
    toast.success('Payee added', { description: `${payee.nickname} · ${payee.masked}` });
  } catch (error) {
    const friendly = notifyError(error);
    formError = friendly.message;
  } finally {
    saving = false;
  }
}

async function remove() {
  if (!removing) return;
  const name = removing.nickname || removing.name;
  try {
    await services.removeBeneficiary(removing.id);
  } catch (error) {
    const friendly = describeError(error);
    throw new Error(friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message);
  }
  toast.success('Payee removed', { description: name });
  removing = null;
}
</script>

<Page title="Payees" subtitle="People and businesses you pay">
  {#snippet actions()}
    {#if canManage}
      <Button size="icon" variant="ghost" aria-label="Add payee" onclick={openSheet}>
        <Plus aria-hidden="true" />
      </Button>
    {/if}
  {/snippet}

  {#if !canManage}
    <Notice title="Read-only list">
      Only the primary holder can add or remove payees.
    </Notice>
  {/if}

  {#if payees.loading}
    <div class="flex flex-col gap-3">{#each [1, 2, 3] as n (n)}<Skeleton class="h-16 rounded-xl" />{/each}</div>
  {:else if (payees.current?.length ?? 0) === 0}
    <EmptyState
      icon={Users}
      title="No payees yet"
      description="Save the people and businesses you pay so sending money takes two taps."
    >
      {#snippet action()}
        {#if canManage}<Button onclick={openSheet}><Plus aria-hidden="true" />Add a payee</Button>{/if}
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col divide-y divide-border rounded-2xl bg-surface px-4 shadow-soft">
      {#each payees.current ?? [] as payee (payee.id)}
        <li class="flex min-h-16 items-center gap-3 py-3">
          <Avatar name={payee.name} decorative />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{payee.nickname || payee.name}</p>
            <p class="truncate text-xs text-muted-foreground">
              {payee.nickname ? `${payee.name} · ` : ''}{payee.institution} · {payee.masked}
            </p>
          </div>
          {#if canSend}
            <Button size="icon" variant="ghost" href={`#/transfer?to=${payee.id}`} aria-label={`Send money to ${payee.nickname || payee.name}`}>
              <Send aria-hidden="true" />
            </Button>
          {/if}
          {#if canManage}
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${payee.nickname || payee.name}`}
              onclick={() => {
                removing = payee;
                removeOpen = true;
              }}
            >
              <Trash aria-hidden="true" />
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Page>

<AlertDialog
  bind:open={removeOpen}
  title={`Remove ${removing?.nickname || removing?.name || 'payee'}?`}
  description="Past transfers stay in your history. You can add them again later."
  confirmLabel="Remove payee"
  destructive
  onConfirm={remove}
  onCancel={() => (removing = null)}
/>

<BottomSheet bind:open={sheetOpen} title="Add a payee" description="Fictional details only — this is a demo bank.">
  <form class="flex flex-col gap-4 pb-2" onsubmit={save} novalidate>
    <Notice tone="warning" icon="warning" title="Demo — never enter real details">
      Use made-up names and only 4 digits. Nothing leaves this browser.
    </Notice>
    <FormField label="Full name" error={errors.name} required>
      {#snippet children({ props })}
        <Input {...props} bind:value={form.name} autocomplete="off" placeholder="Casey Morgan" />
      {/snippet}
    </FormField>
    <FormField label="Nickname" description="Optional — shown in lists." error={errors.nickname}>
      {#snippet children({ props })}
        <Input {...props} bind:value={form.nickname} autocomplete="off" placeholder="Casey" />
      {/snippet}
    </FormField>
    <FormField label="Bank (fictional)" error={errors.institution} required>
      {#snippet children({ props })}
        <Input {...props} bind:value={form.institution} autocomplete="off" placeholder="Harborline Credit Union" />
      {/snippet}
    </FormField>
    <FormField label="Last 4 digits of their account" description="Never a full account number." error={errors.last4} required>
      {#snippet children({ props })}
        <Input {...props} bind:value={form.last4} inputmode="numeric" maxlength={4} autocomplete="off" placeholder="1234" class="w-28 tabular-nums" />
      {/snippet}
    </FormField>
    {#if formError}<p role="alert" class="text-sm text-destructive">{formError}</p>{/if}
    <Button type="submit" size="lg" loading={saving} loadingLabel="Saving…">Save payee</Button>
  </form>
</BottomSheet>
