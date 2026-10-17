<script lang="ts">
import { ArrowLeftRight, LockOpen, Search, Snowflake, SunMedium } from '@lucide/svelte';
import { can, liveQuery, type RouteProps, useClock } from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  toast,
} from '@protoyard/ui';
import AccountStatusBadge from '../components/AccountStatusBadge.svelte';
import { ACCOUNT_ICONS } from '../components/icons.ts';
import Notice from '../components/Notice.svelte';
import Page from '../components/Page.svelte';
import TransactionGroups from '../components/TransactionGroups.svelte';
import { CATEGORIES, type Category } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBank } from '../lib/context.ts';
import { matchesFilter } from '../lib/derive.ts';
import { describeError } from '../lib/errors.ts';
import {
  ACCOUNT_TYPE_LABELS,
  CATEGORY_LABELS,
  formatMoney,
  formatShortDate,
} from '../lib/format.ts';

let { params }: RouteProps = $props();

const { db, services } = useBank();
const clock = useClock();

const accountId = $derived(params.id ?? '');
const account = liveQuery(() => db.accounts.get(accountId));
const transactions = liveQuery(() =>
  db.transactions.where('accountId').equals(accountId).toArray()
);

let search = $state('');
let category = $state<Category | ''>('');
let confirmOpen = $state(false);

const current = $derived(account.current);
const rows = $derived(
  [...(transactions.current ?? [])]
    .filter((t) => matchesFilter(t, { search, category }))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
);
const pendingCents = $derived(
  (transactions.current ?? [])
    .filter((t) => t.status === 'pending')
    .reduce((sum, t) => sum + t.amountCents, 0)
);
const canManage = $derived(can(CAPABILITIES.accountsManage));
const Icon = $derived(current ? ACCOUNT_ICONS[current.type] : null);
const categoryItems = [
  { value: '', label: 'All categories' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
];

const action = $derived(
  !current
    ? null
    : current.status === 'active'
      ? {
          label: 'Freeze account',
          next: 'locked' as const,
          title: `Freeze ${current.name}?`,
          description:
            'Nobody in the household can send money from it until you unfreeze it. Incoming money and balances are unaffected.',
          destructive: true,
        }
      : {
          label: current.status === 'locked' ? 'Unfreeze account' : 'Reactivate account',
          next: 'active' as const,
          title:
            current.status === 'locked'
              ? `Unfreeze ${current.name}?`
              : `Reactivate ${current.name}?`,
          description: 'Transfers from this account will be allowed again.',
          destructive: false,
        }
);

// Captured when the dialog opens, so its text doesn't flip to the opposite
// action while it fades out after a successful change.
let dialogAction = $state<typeof action>(null);
let wasOpen = false;
$effect(() => {
  const open = confirmOpen;
  if (open && !wasOpen) dialogAction = action;
  wasOpen = open;
});

async function applyStatus() {
  const chosen = dialogAction ?? action;
  if (!current || !chosen) return;
  try {
    await services.setAccountStatus(current.id, chosen.next);
  } catch (error) {
    // AlertDialog keeps itself open and shows this message inline.
    const friendly = describeError(error);
    throw new Error(friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message);
  }
  toast.success(chosen.next === 'locked' ? 'Account frozen' : 'Account active again');
}
</script>

<Page title={current?.name ?? 'Account'} subtitle={current ? `${ACCOUNT_TYPE_LABELS[current.type]} · ${current.masked}` : undefined} backHref="#/">
  {#if account.loading}
    <Skeleton class="h-36 rounded-2xl" />
  {:else if !current}
    <ErrorState title="Account not found" message="It may belong to another scenario. Go back to your accounts.">
      {#snippet action()}<Button href="#/" variant="outline">Back to home</Button>{/snippet}
    </ErrorState>
  {:else}
    <section class="rounded-2xl bg-surface p-5 shadow-soft" aria-labelledby="acct-balance">
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          {#if Icon}<Icon class="size-4" aria-hidden="true" />{/if}
          {current.type === 'credit' ? 'Current balance' : 'Available balance'}
        </span>
        <AccountStatusBadge status={current.status} />
      </div>
      <p id="acct-balance" class="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {formatMoney(current.balanceCents)}
      </p>
      <dl class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div><dt>Pending</dt><dd class="font-medium text-foreground tabular-nums">{formatMoney(pendingCents)}</dd></div>
        <div><dt>Transfer limit</dt><dd class="font-medium text-foreground tabular-nums">{formatMoney(current.dailyLimitCents)}</dd></div>
        <div><dt>Opened</dt><dd class="font-medium text-foreground">{formatShortDate(current.openedAt)}</dd></div>
        <div><dt>Status</dt><dd class="font-medium text-foreground capitalize">{current.status}</dd></div>
      </dl>
      <div class="mt-4 flex flex-wrap gap-2">
        {#if current.status === 'active'}
          <Button href={`#/transfer?from=${current.id}`} size="lg" class="flex-1">
            <ArrowLeftRight aria-hidden="true" />Move money
          </Button>
        {/if}
        {#if canManage && action}
          <AlertDialog
            bind:open={confirmOpen}
            title={dialogAction?.title ?? action.title}
            description={dialogAction?.description ?? action.description}
            confirmLabel={dialogAction?.label ?? action.label}
            destructive={dialogAction?.destructive ?? action.destructive}
            onConfirm={applyStatus}
          >
            {#snippet trigger({ props })}
              <Button {...props} variant={action.destructive ? 'outline' : 'default'} size="lg" class="flex-1">
                {#if action.next === 'locked'}<Snowflake aria-hidden="true" />{:else if current.status === 'locked'}<LockOpen aria-hidden="true" />{:else}<SunMedium aria-hidden="true" />{/if}
                {action.label}
              </Button>
            {/snippet}
          </AlertDialog>
        {/if}
      </div>
      {#if !canManage && current.status !== 'active'}
        <p class="mt-3 text-xs text-muted-foreground">Only the primary holder can unfreeze or reactivate this account.</p>
      {/if}
    </section>

    {#if current.status === 'locked'}
      <Notice tone="danger" icon="warning" title="Locked after suspicious activity (simulated)">
        Transfers from this account are blocked. Card payments and deposits would also be held in a real bank.
      </Notice>
    {:else if current.status === 'dormant'}
      <Notice tone="warning" icon="warning" title="Dormant account">
        No activity for months. Reactivate it to send money again.
      </Notice>
    {/if}

    <section aria-labelledby="acct-activity" class="flex flex-col gap-3">
      <h2 id="acct-activity" class="text-base font-semibold">Transactions</h2>
      <div class="flex flex-col gap-2 sm:flex-row">
        <label class="relative flex-1">
          <span class="sr-only">Search transactions</span>
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" placeholder="Search merchant or memo" class="pl-9" bind:value={search} />
        </label>
        <Select items={categoryItems} bind:value={category} aria-label="Filter by category" class="sm:w-44" />
      </div>
      {#if transactions.loading}
        <Skeleton class="h-40" />
      {:else if rows.length === 0}
        <EmptyState
          size="sm"
          title={(transactions.current?.length ?? 0) === 0 ? 'No transactions yet' : 'No matches'}
          description={(transactions.current?.length ?? 0) === 0
            ? 'Money in and out of this account will show up here.'
            : 'Try another search or category.'}
        />
      {:else}
        <TransactionGroups transactions={rows} now={clock.now} />
      {/if}
    </section>
  {/if}
</Page>
