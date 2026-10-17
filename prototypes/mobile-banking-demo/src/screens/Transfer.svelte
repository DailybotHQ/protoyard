<script lang="ts">
import { CircleCheck, Lock } from '@lucide/svelte';
import {
  can,
  liveQuery,
  navigate,
  type RouteProps,
  useAppearance,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Avatar, Button, EmptyState, FormField, Input, Skeleton, toast } from '@protoyard/ui';
import { fly } from 'svelte/transition';
import ChoiceList from '../components/ChoiceList.svelte';
import { ACCOUNT_ICONS } from '../components/icons.ts';
import Notice from '../components/Notice.svelte';
import Page from '../components/Page.svelte';
import type { Account, Transfer } from '../database/schema.ts';
import { CAPABILITIES, MEMBER_TRANSFER_LIMIT_CENTS } from '../domain/policy.ts';
import { useBank } from '../lib/context.ts';
import { sortAccounts } from '../lib/derive.ts';
import { describeError, type FriendlyError } from '../lib/errors.ts';
import { notifyError } from '../lib/feedback.ts';
import { formatDateTime, formatMoney, parseAmount } from '../lib/format.ts';

let { query }: RouteProps = $props();

type Step = 'from' | 'to' | 'amount' | 'review' | 'done';
interface Recipient {
  id: string;
  kind: 'account' | 'payee';
  name: string;
  detail: string;
}

const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'from', label: 'From' },
  { id: 'to', label: 'To' },
  { id: 'amount', label: 'Amount' },
  { id: 'review', label: 'Review' },
];

const { db, services } = useBank();
const clock = useClock();
const appearance = useAppearance();
const principal = usePrincipal();

const accounts = liveQuery(() => db.accounts.toArray());
const payees = liveQuery(() => db.beneficiaries.orderBy('name').toArray());

// svelte-ignore state_referenced_locally
let fromId = $state<string | null>(query.get('from'));
// svelte-ignore state_referenced_locally
let toId = $state<string | null>(query.get('to'));
let step = $state<Step>('from');
let amountText = $state('');
let memo = $state('');
let amountTouched = $state(false);
let submitting = $state(false);
let failure = $state<FriendlyError | null>(null);
let receipt = $state<Transfer | null>(null);
let initialised = false;

const accountList = $derived(sortAccounts(accounts.current ?? []));
const recipients = $derived<Recipient[]>([
  ...accountList
    .filter((a) => a.id !== fromId)
    .map((a) => ({
      id: a.id,
      kind: 'account' as const,
      name: a.name,
      detail: `Your account · ${a.masked}`,
    })),
  ...(payees.current ?? []).map((p) => ({
    id: p.id,
    kind: 'payee' as const,
    name: p.nickname ? `${p.nickname} (${p.name})` : p.name,
    detail: `${p.institution} · ${p.masked}`,
  })),
]);
const from = $derived<Account | undefined>(accountList.find((a) => a.id === fromId));
const to = $derived(recipients.find((r) => r.id === toId));
const toAccount = $derived(accountList.find((a) => a.id === toId));
const amount = $derived(parseAmount(amountText));
const amountCents = $derived(amount === null ? 0 : Math.round(amount * 100));
const isMember = $derived(principal.current?.role === 'member');
const canSend = $derived(can(CAPABILITIES.transfersCreate));
const reduced = $derived(appearance.current.reducedMotion.value);
const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

const amountError = $derived(
  !amountTouched ? null : amount === null ? 'Enter an amount like 25 or 25.50.' : null
);
const amountWarnings = $derived.by(() => {
  const out: string[] = [];
  if (!from || amount === null) return out;
  if (from.type !== 'credit' && amountCents > from.balanceCents) {
    out.push(`That's more than the ${formatMoney(from.balanceCents)} available in ${from.name}.`);
  }
  if (amountCents > from.dailyLimitCents) {
    out.push(`${from.name} has a ${formatMoney(from.dailyLimitCents)} per-transfer limit.`);
  }
  if (isMember && amountCents > MEMBER_TRANSFER_LIMIT_CENTS) {
    out.push(
      `Joint holders can send up to ${formatMoney(MEMBER_TRANSFER_LIMIT_CENTS)} per transfer.`
    );
  }
  return out;
});

// Deep links (`#/transfer?from=…&to=…`) skip the steps they already answer.
$effect(() => {
  if (initialised || accounts.loading || payees.loading) return;
  initialised = true;
  if (fromId && !accountList.some((a) => a.id === fromId && a.status === 'active')) fromId = null;
  if (toId && !recipients.some((r) => r.id === toId)) toId = null;
  step = fromId ? (toId ? 'amount' : 'to') : 'from';
});

function accountBlocked(account: Account): string | null {
  if (account.status === 'locked') return 'Locked — transfers are blocked';
  if (account.status === 'dormant') return 'Dormant — reactivate it first';
  return null;
}

function goBack() {
  failure = null;
  if (step === 'to') step = 'from';
  else if (step === 'amount') step = 'to';
  else if (step === 'review') step = 'amount';
  else navigate('/');
}

function toReview(event: SubmitEvent) {
  event.preventDefault();
  amountTouched = true;
  if (amount === null) return;
  failure = null;
  step = 'review';
}

async function confirm() {
  if (!from || !to || amount === null || submitting) return;
  submitting = true;
  failure = null;
  try {
    receipt = await services.transfer({
      fromAccountId: from.id,
      toAccountId: to.kind === 'account' ? to.id : null,
      beneficiaryId: to.kind === 'payee' ? to.id : null,
      amount,
      memo,
    });
    step = 'done';
    toast.success('Money sent', { description: `${formatMoney(amountCents)} to ${to.name}.` });
  } catch (error) {
    // Nothing was written: the service runs in one transaction.
    failure = describeError(error);
    notifyError(error);
  } finally {
    submitting = false;
  }
}

function startOver() {
  receipt = null;
  failure = null;
  amountText = '';
  memo = '';
  amountTouched = false;
  toId = null;
  step = 'from';
}

const quickAmounts = [20, 50, 100, 250];
</script>

<Page
  title={step === 'done' ? 'Transfer sent' : 'Send money'}
  subtitle={step === 'done' ? undefined : `Step ${stepIndex + 1} of ${STEPS.length} · ${STEPS[stepIndex]?.label ?? ''}`}
  onBack={step === 'done' ? undefined : goBack}
>
  {#if !canSend}
    <EmptyState
      icon={Lock}
      title="Transfers aren't available for your access"
      description="View-only members can see balances and history. Ask the primary holder to send money."
    >
      {#snippet action()}<Button href="#/" variant="outline">Back to home</Button>{/snippet}
    </EmptyState>
  {:else if accounts.loading || payees.loading}
    <Skeleton class="h-48 rounded-2xl" />
  {:else}
    {#if step !== 'done'}
      <ol class="grid grid-cols-4 gap-1.5" aria-label="Progress">
        {#each STEPS as s, i (s.id)}
          <li class="flex flex-col gap-1">
            <span class={['h-1.5 rounded-full', i <= stepIndex ? 'bg-primary' : 'bg-muted']}></span>
            <span class={['text-[0.7rem]', i === stepIndex ? 'font-semibold text-foreground' : 'text-muted-foreground']} aria-current={i === stepIndex ? 'step' : undefined}>
              {s.label}
            </span>
          </li>
        {/each}
      </ol>
    {/if}

    {#key step}
      <section class="flex flex-col gap-4" in:fly={{ x: 24, duration: reduced ? 0 : 180 }}>
        {#if step === 'from'}
          <h2 class="text-lg font-semibold">Send from</h2>
          {#if accountList.length === 0}
            <EmptyState size="sm" title="No accounts yet" description="Open an account to move money." />
          {:else}
            <ChoiceList
              label="Source account"
              items={accountList}
              selected={fromId}
              disabled={accountBlocked}
              onPick={(account) => {
                fromId = account.id;
                if (toId === account.id) toId = null;
                step = 'to';
              }}
            >
              {#snippet row(account)}
                {@const Icon = ACCOUNT_ICONS[account.type]}
                <span class="flex items-center gap-3">
                  <Icon class="size-5 text-primary" aria-hidden="true" />
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{account.name} <span class="text-muted-foreground">{account.masked}</span></span>
                    <span class="block text-sm text-muted-foreground tabular-nums">{formatMoney(account.balanceCents)} available</span>
                  </span>
                </span>
              {/snippet}
            </ChoiceList>
          {/if}
        {:else if step === 'to'}
          <h2 class="text-lg font-semibold">Send to</h2>
          {#if recipients.length === 0}
            <EmptyState size="sm" title="No recipients yet" description="Add a payee, or open another account to move money between your own accounts.">
              {#snippet action()}<Button href="#/payees" variant="outline">Add a payee</Button>{/snippet}
            </EmptyState>
          {:else}
            <ChoiceList
              label="Recipient"
              items={recipients}
              selected={toId}
              disabled={(r) => {
                const acct = r.kind === 'account' ? accountList.find((a) => a.id === r.id) : undefined;
                return acct ? accountBlocked(acct) : null;
              }}
              onPick={(r) => {
                toId = r.id;
                step = 'amount';
              }}
            >
              {#snippet row(r)}
                <span class="flex items-center gap-3">
                  <Avatar name={r.name} size="sm" decorative />
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{r.name}</span>
                    <span class="block truncate text-sm text-muted-foreground">{r.detail}</span>
                  </span>
                </span>
              {/snippet}
            </ChoiceList>
            <a href="#/payees" class="inline-flex min-h-11 items-center text-sm font-medium text-primary">Manage payees</a>
          {/if}
        {:else if step === 'amount' && from && to}
          <h2 class="text-lg font-semibold">How much?</h2>
          <p class="text-sm text-muted-foreground">
            From <strong class="text-foreground">{from.name}</strong> to <strong class="text-foreground">{to.name}</strong>
          </p>
          <form class="flex flex-col gap-4" onsubmit={toReview} novalidate>
            <FormField label="Amount (USD)" error={amountError} required description={`${formatMoney(from.balanceCents)} available`}>
              {#snippet children({ props })}
                <div class="relative">
                  <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-semibold text-muted-foreground" aria-hidden="true">$</span>
                  <Input
                    {...props}
                    bind:value={amountText}
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0.00"
                    class="h-16 pl-9 text-3xl font-semibold tabular-nums"
                    onblur={() => (amountTouched = amountText.length > 0)}
                  />
                </div>
              {/snippet}
            </FormField>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              {#each quickAmounts as quick (quick)}
                <Button variant="secondary" size="sm" onclick={() => (amountText = String(quick))}>${quick}</Button>
              {/each}
            </div>
            {#each amountWarnings as warning (warning)}
              <Notice tone="warning" icon="warning" title={warning} />
            {/each}
            <FormField label="Memo (optional)" description="Shown on both sides of the transfer.">
              {#snippet children({ props })}
                <Input {...props} bind:value={memo} maxlength={80} placeholder="e.g. Dinner split" />
              {/snippet}
            </FormField>
            <Button type="submit" size="lg" disabled={amountText.length === 0}>Review transfer</Button>
          </form>
        {:else if step === 'review' && from && to && amount !== null}
          <h2 class="text-lg font-semibold">Review and send</h2>
          <dl class="divide-y divide-border rounded-2xl bg-surface px-4 shadow-soft">
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">Amount</dt><dd class="text-xl font-semibold tabular-nums">{formatMoney(amountCents)}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">From</dt><dd class="text-right">{from.name}<br /><span class="text-xs text-muted-foreground">{from.masked}</span></dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">To</dt><dd class="text-right">{to.name}<br /><span class="text-xs text-muted-foreground">{to.detail}</span></dd></div>
            {#if memo.trim()}<div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">Memo</dt><dd class="text-right">{memo.trim()}</dd></div>{/if}
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">Arrives</dt><dd>{toAccount ? 'Instantly' : 'Today (simulated)'}</dd></div>
          </dl>
          {#if failure}
            <div role="alert" class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <p class="font-semibold">{failure.title}</p>
              <p class="mt-0.5">{failure.message}</p>
              {#if failure.hint}<p class="mt-1 text-muted-foreground">{failure.hint}</p>{/if}
              <p class="mt-1 text-xs text-muted-foreground">No money moved.</p>
            </div>
          {/if}
          <Button size="lg" onclick={confirm} loading={submitting} loadingLabel="Sending…">
            Send {formatMoney(amountCents)}
          </Button>
          <Button variant="ghost" onclick={goBack} disabled={submitting}>Edit amount</Button>
        {:else if step === 'done' && receipt}
          <div class="flex flex-col items-center gap-2 pt-4 text-center">
            <span class="grid size-16 place-items-center rounded-full bg-success text-success-foreground" aria-hidden="true">
              <CircleCheck class="size-9" />
            </span>
            <h2 class="text-2xl font-semibold tabular-nums">{formatMoney(receipt.amountCents)}</h2>
            <p class="text-muted-foreground">sent to {to?.name ?? 'recipient'}</p>
          </div>
          <dl class="divide-y divide-border rounded-2xl bg-surface px-4 text-sm shadow-soft">
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">Reference</dt><dd class="font-mono text-xs break-all" data-testid="transfer-reference">{receipt.id}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">From</dt><dd>{from?.name}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">When</dt><dd>{formatDateTime(receipt.at)}</dd></div>
            <div class="flex justify-between gap-4 py-3"><dt class="text-muted-foreground">New balance</dt><dd class="tabular-nums">{from ? formatMoney(from.balanceCents) : '—'}</dd></div>
          </dl>
          <p class="text-center text-xs text-muted-foreground">Simulated transfer between fictional accounts. No real money moved.</p>
          <Button size="lg" href="#/">Done</Button>
          <Button variant="outline" onclick={startOver}>Make another transfer</Button>
        {:else}
          <Button variant="outline" onclick={startOver}>Start again</Button>
        {/if}
      </section>
    {/key}
  {/if}
</Page>

<!-- The simulated time keeps the receipt honest after a clock preview. -->
<span class="sr-only" aria-hidden="true">{clock.now.toISOString()}</span>
