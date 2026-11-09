<script lang="ts">
import type { CartesianSeries } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Progress,
  Select,
  Skeleton,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { Box, Heading, Text } from 'texuli/typography';
import { LEDGER_SHEET_ROWS, ledgerSheet } from '../domain/ledger-sheet.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import {
  readAccounts,
  readBalanceSnapshots,
  readBudgets,
  readTransactions,
} from '../domain/queries.ts';
import { useFintech } from '../lib/context.ts';

const { db, runtime, services } = useFintech();
const principal = usePrincipal();
const accounts = liveQuery(() => readAccounts(db), { initial: [] });
const transactions = liveQuery(() => readTransactions(db), { initial: [] });
const snapshots = liveQuery(() => readBalanceSnapshots(db), { initial: [] });
const budgets = liveQuery(() => readBudgets(db), { initial: [] });
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
// The spreadsheet is its own lazy chunk, like the charts.
type LazySheetView = typeof import('@protoyard/views-ui/sheet').SheetView;
let SheetView = $state<LazySheetView | null>(null);
let sheetError = $state<string | null>(null);
function loadSheet() {
  sheetError = null;
  return import('@protoyard/views-ui/sheet').then(
    (module) => {
      SheetView = module.SheetView;
    },
    (error: unknown) => {
      sheetError = error instanceof Error ? error.message : String(error);
    }
  );
}
onMount(() => {
  void import('@protoyard/charts-ui/cartesian').then((module) => {
    LineChart = module.LineChart;
    BarChart = module.BarChart;
  });
  void loadSheet();
});
/** The ledger as a read-only sheet, rebuilt whenever a transaction or account changes. */
const ledger = $derived({
  current:
    transactions.current === undefined
      ? undefined
      : ledgerSheet(transactions.current, accounts.current ?? []),
  loading: transactions.current === undefined,
  error: transactions.error,
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
    <Text size="sm" weight="medium" tone="primary">Northstar Household · simulated finance</Text>
    <Heading level={1} size="xl">Money overview</Heading>
    <Text tone="muted" class="mt-2 max-w-2xl">Balances, categorized activity and monthly budgets. All amounts are fictional and stored in this browser.</Text>
  </div>
  <Text size="sm" tone="muted">Updated from simulated time · {runtime.clock.now().toLocaleDateString('en-US')}</Text>
</header>

{#if accounts.error || transactions.error}
  <ErrorState title="Could not load financial data" message={String(accounts.error ?? transactions.error)} />
{:else if accounts.current === undefined || transactions.current === undefined}
  <Skeleton class="h-72 w-full" />
{:else}
  <section aria-label="Account summary" class="mb-5 grid gap-4 sm:grid-cols-2">
    {#each accounts.current as account (account.id)}
      <Card class="p-5">
        <Text size="sm" tone="muted">{account.name}</Text>
        <Text size="figure" weight="semibold" tabular class="mt-2">{money(account.balanceCents)}</Text>
        <Text size="xs" tone="muted" class="mt-1">{account.currency} · {account.type}</Text>
      </Card>
    {/each}
    <Card class="p-5 sm:col-span-2">
      <Text size="sm" tone="muted">Total available across accounts</Text>
      <Text size="figure" weight="semibold" tabular class="mt-2">{money(totalCents)}</Text>
      <Text size="xs" tone="muted" class="mt-1">{money(monthExpenses)} spent this month</Text>
    </Card>
  </section>

  {#if snapshots.current?.length}
    <section aria-label="Balance and cash flow charts" class="mb-5 grid gap-5 xl:grid-cols-2">
      <Card class="min-w-0 space-y-3 p-5">
        <div><Heading level={2} size="sm">Checking balance</Heading><Text size="sm" tone="muted">Daily balance movement with a generated payday cycle.</Text></div>
        {#if LineChart}<LineChart title="Checking balance over time" description="Simulated daily balance in cents." series={balanceSeries} xKind="time" unit="cents" height={260} showTable />{:else}<Skeleton class="h-64 w-full" />{/if}
      </Card>
      <Card class="min-w-0 space-y-3 p-5">
        <div><Heading level={2} size="sm">Cash flow</Heading><Text size="sm" tone="muted">Income and expenses grouped by month.</Text></div>
        {#if BarChart}<BarChart title="Monthly cash flow" description="Recorded income and expenses by month." series={cashFlowSeries} xKind="category" unit="cents" height={260} showTable />{:else}<Skeleton class="h-64 w-full" />{/if}
      </Card>
    </section>
  {/if}

  <div class="grid gap-5 xl:grid-cols-5">
    <Card class="min-w-0 space-y-4 p-5 xl:col-span-3">
      <div class="flex items-end justify-between gap-2"><div><Heading level={2} size="md">Transactions</Heading><Text size="sm" tone="muted">Every categorized movement, newest first, with a net total. Download it as CSV.</Text></div><Text as="span" size="xs" tone="muted">{transactions.current.length > LEDGER_SHEET_ROWS ? `Latest ${LEDGER_SHEET_ROWS.toLocaleString('en-US')} of ${transactions.current.length.toLocaleString('en-US')}` : `${transactions.current.length} records`}</Text></div>
      {#if transactions.current.length === 0}
        <EmptyState title="No transactions yet" description="Your account activity will appear here as it is generated or recorded." />
      {:else if sheetError}
        <ErrorState title="Could not load the spreadsheet" message={sheetError} onRetry={loadSheet} retryLabel="Try again" />
      {:else if SheetView}
        <div class="h-96 min-h-0"><SheetView query={ledger} label="Transactions" readonly {runtime} class="h-full" /></div>
      {:else}
        <Skeleton class="h-96 w-full" />
      {/if}
    </Card>

    <div class="min-w-0 space-y-5 xl:col-span-2">
      <Card class="space-y-4 p-5">
        <div><Heading level={2} size="md">Monthly budgets</Heading><Text size="sm" tone="muted">Alerts start at each category's threshold.</Text></div>
        <ul class="space-y-4">
          {#each budgets.current ?? [] as budget (budget.id)}
            {@const spent = budgetSpent(budget.category)}
            {@const ratio = budget.limitCents ? spent / budget.limitCents : 0}
            <li>
              <div class="flex justify-between gap-3"><Text as="span" size="sm" weight="medium">{budget.category}</Text><Text as="span" size="sm" tabular>{money(spent)} / {money(budget.limitCents)}</Text></div>
              <Progress value={Math.min(100, ratio * 100)} size="sm" ariaLabel={`${budget.category} budget used`} class="mt-2" />
              {#if spent >= budget.alertAtCents}<Text size="xs" weight="medium" tone="destructive" role="status" class="mt-1">Budget alert · {Math.round(ratio * 100)}% used</Text>{:else}<Text size="xs" tone="muted" class="mt-1">Alert at {money(budget.alertAtCents)}</Text>{/if}
            </li>
          {/each}
        </ul>
      </Card>

      <Card class="space-y-4 p-5">
        <div><Heading level={2} size="md">Move money</Heading><Text size="sm" tone="muted">A transfer updates both account balances and ledger entries.</Text></div>
        {#if canTransfer}
          <form class="space-y-3" onsubmit={(event) => event.preventDefault()}>
            <Text as="label" size="sm" class="flex flex-col gap-1">From account<Select class="w-full" bind:value={fromAccountId} items={accounts.current.map((account) => ({ value: account.id, label: `${account.name} · ${money(account.balanceCents)}` }))} /></Text>
            <Text as="label" size="sm" class="flex flex-col gap-1">To account<Select class="w-full" bind:value={toAccountId} items={accounts.current.map((account) => ({ value: account.id, label: account.name }))} /></Text>
            <Text as="label" size="sm" class="flex flex-col gap-1">Amount (USD)<Input class="w-full" inputmode="decimal" placeholder="125.00" bind:value={amount} /></Text>
            <Text as="label" size="sm" class="flex flex-col gap-1">Note<Input class="w-full" maxlength={120} bind:value={memo} /></Text>
            <Button type="submit" class="w-full" onclick={() => submitTransfer()}>Transfer funds</Button>
            {#if transferMessage}<Text size="sm" tone={transferSuccess ? 'primary' : 'destructive'} role={transferSuccess ? 'status' : 'alert'}>{transferMessage}</Text>{/if}
          </form>
        {:else}
          <Box surface="muted" radius="md" padding="sm"><Text size="sm" tone="muted">Read-only persona: transfers are unavailable.</Text></Box>
        {/if}
      </Card>
    </div>
  </div>
{/if}
