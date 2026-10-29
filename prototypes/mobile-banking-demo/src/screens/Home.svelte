<script lang="ts">
import { ArrowLeftRight, Banknote, Landmark, ReceiptText, Users } from '@lucide/svelte';
import { MS_PER_DAY } from '@protoyard/core';
import { can, liveQuery, useClock, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, EmptyState, Skeleton, toast } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import AccountCard from '../components/AccountCard.svelte';
import Notice from '../components/Notice.svelte';
import Page from '../components/Page.svelte';
import SpendingBars from '../components/SpendingBars.svelte';
import TransactionRow from '../components/TransactionRow.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useBank } from '../lib/context.ts';
import { sortAccounts, spendingByCategory, totalBalance } from '../lib/derive.ts';
import { notifyError } from '../lib/feedback.ts';
import { formatMoney, greeting } from '../lib/format.ts';
import { PAYROLL_CENTS } from '../lib/simulations.ts';

const { db, simulations } = useBank();
const principal = usePrincipal();
const clock = useClock();

const accounts = liveQuery(() => db.accounts.toArray());
const recent = liveQuery(() => db.transactions.orderBy('at').reverse().limit(6).toArray());
// The 30-day window follows the simulated clock (preview / advance).
const lastMonth = liveQuery(
  () => {
    const from = new Date(clock.now.getTime() - 30 * MS_PER_DAY).toISOString();
    return db.transactions.where('at').above(from).toArray();
  },
  { deps: () => clock.now.getTime() }
);

const list = $derived(sortAccounts(accounts.current ?? []));
const names = $derived(Object.fromEntries(list.map((a) => [a.id, a.name])));
const spending = $derived(spendingByCategory(lastMonth.current ?? [], clock.now));
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');
const locked = $derived(list.filter((a) => a.status === 'locked'));
const dormant = $derived(list.filter((a) => a.status === 'dormant'));
const canMove = $derived(can(CAPABILITIES.transfersCreate));
const depositTarget = $derived(list.find((a) => a.type === 'checking' && a.status === 'active'));
const isNew = $derived(!recent.loading && (recent.current?.length ?? 0) === 0);

let depositing = $state(false);
async function deposit() {
  if (!depositTarget) return;
  depositing = true;
  try {
    await simulations.simulatePayroll(depositTarget.id);
    toast.success('Payroll deposited', {
      description: `${formatMoney(PAYROLL_CENTS)} landed in ${depositTarget.name} (simulated).`,
    });
  } catch (error) {
    notifyError(error);
  } finally {
    depositing = false;
  }
}

const quickActions = [
  { href: '#/transfer', label: 'Transfer', icon: ArrowLeftRight },
  { href: '#/payees', label: 'Payees', icon: Users },
  { href: '#/activity', label: 'Activity', icon: ReceiptText },
];
</script>

<Page title="Lumen Bank" subtitle="Fictional bank · demo data">
  <section aria-labelledby="balance-heading" class="flex flex-col gap-1">
    <p class="text-sm text-muted-foreground">{greeting(clock.now)}, {firstName}</p>
    <h2 id="balance-heading" class="text-sm font-medium text-muted-foreground">Total balance</h2>
    {#if accounts.loading}
      <Skeleton class="h-10 w-44" />
    {:else}
      <p class="text-4xl font-semibold tracking-tight tabular-nums" data-testid="total-balance">
        {formatMoney(totalBalance(list))}
      </p>
      <p class="text-xs text-muted-foreground">Across {list.length} account{list.length === 1 ? '' : 's'}, net of card balances</p>
    {/if}
  </section>

  {#if locked.length}
    <Notice tone="danger" icon="warning" title="Accounts locked (simulated fraud hold)">
      Balances stay visible but money can't move. <a class="font-medium text-foreground underline" href={`#/accounts/${locked[0]?.id}`}>Review account</a>
    </Notice>
  {/if}
  {#if dormant.length}
    <Notice tone="warning" icon="warning" title="Accounts dormant">
      No activity for months. The primary holder can reactivate them from the account page.
    </Notice>
  {/if}

  <section aria-label="Accounts" class="-mx-4">
    {#if accounts.loading}
      <div class="flex gap-3 px-4"><Skeleton class="h-32 w-64 rounded-2xl" /><Skeleton class="h-32 w-64 rounded-2xl" /></div>
    {:else}
      <ul class="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {#each list as account (account.id)}
          <li class="contents"><AccountCard {account} /></li>
        {/each}
      </ul>
    {/if}
  </section>

  <nav aria-label="Quick actions" class="grid grid-cols-4 gap-2">
    {#each quickActions as action (action.href)}
      <a
        href={action.href}
        class="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface p-2 text-xs font-medium shadow-soft transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <action.icon class="size-5 text-primary" aria-hidden="true" />
        {action.label}
      </a>
    {/each}
    <Button
      type="button"
      variant="ghost"
      class="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface p-2 text-xs font-medium shadow-soft transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!canMove || !depositTarget || depositing}
      title={!canMove ? 'View-only access' : !depositTarget ? 'No active checking account' : undefined}
      onclick={deposit}
    >
      <LucideIcon icon={Banknote} class="size-5 text-primary" />
      {depositing ? 'Adding…' : 'Payroll'}
    </Button>
  </nav>

  {#if isNew}
    <EmptyState
      icon={Landmark}
      title="Welcome to Lumen Bank"
      description="Your account is open but empty. Make your first deposit to start using it — in this demo, a simulated payroll deposit writes a real ledger entry."
    >
      {#snippet action()}
        {#if canMove && depositTarget}
          <Button onclick={deposit} loading={depositing}>
            <LucideIcon icon={Banknote} />Simulate payroll deposit ({formatMoney(PAYROLL_CENTS)})
          </Button>
        {:else}
          <p class="text-sm text-muted-foreground">Ask the primary holder to make the first deposit.</p>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <section aria-labelledby="recent-heading">
      <div class="mb-1 flex items-center justify-between">
        <h2 id="recent-heading" class="text-base font-semibold">Recent activity</h2>
        <a href="#/activity" class="inline-flex min-h-11 items-center text-sm font-medium text-primary">See all</a>
      </div>
      {#if recent.loading}
        <div class="flex flex-col gap-3">{#each [1, 2, 3] as n (n)}<Skeleton class="h-12" />{/each}</div>
      {:else}
        <ul class="divide-y divide-border">
          {#each recent.current ?? [] as transaction (transaction.id)}
            <TransactionRow {transaction} now={clock.now} accountName={names[transaction.accountId]} />
          {/each}
        </ul>
      {/if}
    </section>

    <section aria-labelledby="spending-heading" class="rounded-2xl bg-surface p-4 shadow-soft">
      <h2 id="spending-heading" class="text-base font-semibold">Spending, last 30 days</h2>
      <p class="mb-4 text-xs text-muted-foreground">
        Card and account purchases by category · excludes transfers
      </p>
      {#if spending.length}
        <SpendingBars items={spending} />
      {:else}
        <p class="text-sm text-muted-foreground">No spending in the last 30 days.</p>
      {/if}
    </section>
  {/if}
</Page>
