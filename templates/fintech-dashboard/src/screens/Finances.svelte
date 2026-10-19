<script lang="ts">
import type { CartesianSeries } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { onMount } from 'svelte';
import type { Transaction } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useFintech } from '../lib/context.ts';

const { db, runtime, services } = useFintech();
const principal = usePrincipal();
const accounts = liveQuery(() => db.accounts.orderBy('name').toArray(), { initial: [] });
const transactions = liveQuery(() => db.transactions.orderBy('occurredAt').reverse().toArray(), {
  initial: [],
});
const snapshots = liveQuery(() => db.balanceSnapshots.orderBy('at').toArray(), { initial: [] });
const budgets = liveQuery(() => db.budgets.orderBy('category').toArray(), { initial: [] });
const canTransfer = $derived(can(CAPABILITIES.transfersCreate));
let fromAccountId = $state('account-checking');
let toAccountId = $state('account-savings');
let amount = $state('');
let memo = $state('Monthly savings transfer');
let transferMessage = $state('');
let transferSuccess = $state(false);
type LazyLineChart = typeof import('@protoyard/charts-ui/cartesian').LineChart;
type LazyBarChart = typeof import('@protoyard/charts-ui/cartesian').BarChart;
let LineChart = $state<LazyLineChart | null>(null);
let BarChart = $state<LazyBarChart | null>(null);
onMount(() => {
  void import('@protoyard/charts-ui/cartesian').then((module) => {
    LineChart = module.LineChart;
    BarChart = module.BarChart;
  });
});

const totalCents = $derived(
  (accounts.current ?? []).reduce((sum, account) => sum + account.balanceCents, 0)
);
const currentMonth = $derived(runtime.clock.now().toISOString().slice(0, 7));
const expenseRows = $derived((transactions.current ?? []).filter((row) => row.type === 'expense'));
const monthExpenses = $derived(
  expenseRows
    .filter((row) => row.occurredAt.slice(0, 7) === currentMonth)
    .reduce((sum, row) => sum + row.amountCents, 0)
);
const balanceSeries = $derived.by(() => {
  const rows = snapshots.current ?? [];
  const checking = accounts.current?.find((account) => account.type === 'checking');
  return [
    {
      id: 'checking-balance',
      label: checking?.name ?? 'Checking balance',
      points: rows
        .filter((row) => row.accountId === checking?.id)
        .map((row) => ({ x: Date.parse(row.at), y: row.balanceCents })),
    },
  ] satisfies CartesianSeries[];
});
const cashFlowSeries = $derived.by(() => {
  const rows = transactions.current ?? [];
  const months = [...new Set(rows.map((row) => row.occurredAt.slice(0, 7)))].sort().slice(-6);
  return [
    ...(['income', 'expense'] as const).map((type) => ({
      id: type,
      label: type === 'income' ? 'Income' : 'Spending',
      points: months.map((month) => ({
        x: month,
        y: rows
          .filter((row) => row.type === type && row.occurredAt.slice(0, 7) === month)
          .reduce((sum, row) => sum + row.amountCents, 0),
      })),
    })),
  ] satisfies CartesianSeries[];
});
function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
function budgetSpent(category: string) {
  return expenseRows
    .filter((row) => row.category === category && row.occurredAt.slice(0, 7) === currentMonth)
    .reduce((sum, row) => sum + row.amountCents, 0);
}
function rowEffect(row: Transaction) {
  if (row.type === 'income' || (row.type === 'transfer' && row.direction === 'in')) {
    return `+${money(row.amountCents)}`;
  }
  return `−${money(row.amountCents)}`;
}
async function submitTransfer() {
  transferMessage = '';
  transferSuccess = false;
  const amountCents = Math.round(Number(amount) * 100);
  const result = await runService(
    () => services.transfers.create({ fromAccountId, toAccountId, amountCents, memo }),
    { success: 'Transfer completed' }
  );
  if (result.ok) {
    transferSuccess = true;
    transferMessage = 'Transfer saved to both account ledgers.';
    amount = '';
  } else {
    const source = accounts.current?.find((account) => account.id === fromAccountId);
    transferMessage =
      source && Number.isFinite(amountCents) && amountCents > source.balanceCents
        ? 'There are not enough funds in the selected source account.'
        : 'The transfer was not saved. Check the amount, permissions and simulated network.';
  }
}
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-3">
  <div>
    <p class="text-sm font-medium text-primary">Northstar Household · simulated finance</p>
    <h1 class="text-3xl font-semibold tracking-tight">Money overview</h1>
    <p class="mt-2 max-w-2xl text-muted-foreground">Balances, categorized activity and monthly budgets. All amounts are fictional and stored in this browser.</p>
  </div>
  <p class="text-sm text-muted-foreground">Updated from simulated time · {runtime.clock.now().toLocaleDateString('en-US')}</p>
</header>

{#if accounts.error || transactions.error}
  <ErrorState title="Could not load financial data" message={String(accounts.error ?? transactions.error)} />
{:else if accounts.current === undefined || transactions.current === undefined}
  <Skeleton class="h-72 w-full rounded-xl" />
{:else}
  <section aria-label="Account summary" class="mb-5 grid gap-4 sm:grid-cols-2">
    {#each accounts.current as account (account.id)}
      <Card class="p-5">
        <p class="text-sm text-muted-foreground">{account.name}</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{money(account.balanceCents)}</p>
        <p class="mt-1 text-xs text-muted-foreground">{account.currency} · {account.type}</p>
      </Card>
    {/each}
    <Card class="p-5 sm:col-span-2">
      <p class="text-sm text-muted-foreground">Total available across accounts</p>
      <p class="mt-2 text-3xl font-semibold tabular-nums">{money(totalCents)}</p>
      <p class="mt-1 text-xs text-muted-foreground">{money(monthExpenses)} spent this month</p>
    </Card>
  </section>

  {#if snapshots.current?.length}
    <section aria-label="Balance and cash flow charts" class="mb-5 grid gap-5 xl:grid-cols-2">
      <Card class="min-w-0 space-y-3 p-5">
        <div><h2 class="font-semibold">Checking balance</h2><p class="text-sm text-muted-foreground">Daily balance movement with a generated payday cycle.</p></div>
        {#if LineChart}<LineChart title="Checking balance over time" description="Simulated daily balance in cents." series={balanceSeries} xKind="time" unit="cents" height={260} showTable />{:else}<Skeleton class="h-64 w-full" />{/if}
      </Card>
      <Card class="min-w-0 space-y-3 p-5">
        <div><h2 class="font-semibold">Cash flow</h2><p class="text-sm text-muted-foreground">Income and expenses grouped by month.</p></div>
        {#if BarChart}<BarChart title="Monthly cash flow" description="Recorded income and expenses by month." series={cashFlowSeries} xKind="category" unit="cents" height={260} showTable />{:else}<Skeleton class="h-64 w-full" />{/if}
      </Card>
    </section>
  {/if}

  <div class="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
    <Card class="space-y-4 p-5">
      <div class="flex items-end justify-between gap-2"><div><h2 class="text-lg font-semibold">Recent transactions</h2><p class="text-sm text-muted-foreground">Latest categorized account activity.</p></div><span class="text-xs text-muted-foreground">{transactions.current.length} records</span></div>
      {#if transactions.current.length === 0}
        <EmptyState title="No transactions yet" description="Your account activity will appear here as it is generated or recorded." />
      {:else}
        <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b border-border text-muted-foreground"><th class="py-2 pr-3 font-medium">Description</th><th class="py-2 pr-3 font-medium">Category</th><th class="py-2 pr-3 font-medium">Date</th><th class="py-2 text-right font-medium">Amount</th></tr></thead><tbody>
          {#each transactions.current.slice(0, 10) as row (row.id)}
            <tr class="border-b border-border last:border-0"><td class="py-3 pr-3"><span class="font-medium">{row.description}</span><span class="block text-xs text-muted-foreground">{accounts.current.find((account) => account.id === row.accountId)?.name ?? 'Account'}</span></td><td class="py-3 pr-3">{row.category}</td><td class="py-3 pr-3 whitespace-nowrap">{new Date(row.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td><td class="py-3 text-right font-medium tabular-nums">{rowEffect(row)}</td></tr>
          {/each}
        </tbody></table></div>
      {/if}
    </Card>

    <div class="space-y-5">
      <Card class="space-y-4 p-5">
        <div><h2 class="text-lg font-semibold">Monthly budgets</h2><p class="text-sm text-muted-foreground">Alerts start at each category's threshold.</p></div>
        <ul class="space-y-4">
          {#each budgets.current ?? [] as budget (budget.id)}
            {@const spent = budgetSpent(budget.category)}
            {@const ratio = budget.limitCents ? spent / budget.limitCents : 0}
            <li>
              <div class="flex justify-between gap-3 text-sm"><span class="font-medium">{budget.category}</span><span class="tabular-nums">{money(spent)} / {money(budget.limitCents)}</span></div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style={`width: ${Math.min(100, ratio * 100)}%`}></div></div>
              {#if spent >= budget.alertAtCents}<p class="mt-1 text-xs font-medium text-destructive" role="status">Budget alert · {Math.round(ratio * 100)}% used</p>{:else}<p class="mt-1 text-xs text-muted-foreground">Alert at {money(budget.alertAtCents)}</p>{/if}
            </li>
          {/each}
        </ul>
      </Card>

      <Card class="space-y-4 p-5">
        <div><h2 class="text-lg font-semibold">Move money</h2><p class="text-sm text-muted-foreground">A transfer updates both account balances and ledger entries.</p></div>
        {#if canTransfer}
          <form class="space-y-3" onsubmit={(event) => event.preventDefault()}>
            <label class="block text-sm">From account<select class="mt-1 w-full rounded-md border border-border bg-background p-2" bind:value={fromAccountId}>{#each accounts.current as account (account.id)}<option value={account.id}>{account.name} · {money(account.balanceCents)}</option>{/each}</select></label>
            <label class="block text-sm">To account<select class="mt-1 w-full rounded-md border border-border bg-background p-2" bind:value={toAccountId}>{#each accounts.current as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></label>
            <label class="block text-sm">Amount (USD)<input class="mt-1 w-full rounded-md border border-border bg-background p-2" inputmode="decimal" placeholder="125.00" bind:value={amount} /></label>
            <label class="block text-sm">Note<input class="mt-1 w-full rounded-md border border-border bg-background p-2" maxlength="120" bind:value={memo} /></label>
            <Button type="submit" class="w-full" onclick={() => submitTransfer()}>Transfer funds</Button>
            {#if transferMessage}<p class={`text-sm ${transferSuccess ? 'text-primary' : 'text-destructive'}`} role={transferSuccess ? 'status' : 'alert'}>{transferMessage}</p>{/if}
          </form>
        {:else}
          <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">Read-only persona: transfers are unavailable.</p>
        {/if}
      </Card>
    </div>
  </div>
{/if}
